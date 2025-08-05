"""
IP Tracker and Subnet Management Tool
A Flask web application for managing IP address allocations and subnet management.
"""

import ipaddress
import sqlite3
import os
from functools import wraps

from flask import Flask, jsonify, render_template, request, session, redirect, url_for
from flask_cors import CORS

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev-secret-key-change-in-production')
CORS(app)

DATABASE = "ip_tracker.db"


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if not session.get("logged_in"):
            return redirect(url_for("login"))
        return f(*args, **kwargs)
    return decorated_function


def get_db_connection():
    """Get database connection with row factory for dict-like access."""
    conn = sqlite3.connect(DATABASE)
    conn.row_factory = sqlite3.Row
    return conn


def init_database():
    """Initialize the database with required tables."""
    conn = get_db_connection()

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS supernets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            network TEXT NOT NULL UNIQUE,
            name TEXT,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS subnets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            supernet_id INTEGER,
            network TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            purpose TEXT,
            assigned_to TEXT,
            gateway TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (supernet_id) REFERENCES supernets (id)
        )
    """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS devices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subnet_id INTEGER,
            device_name TEXT NOT NULL,
            role TEXT,
            location TEXT,
            ip_address TEXT NOT NULL UNIQUE,
            hostname TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (subnet_id) REFERENCES subnets (id)
        )
    """
    )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS change_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            object_type TEXT NOT NULL,
            object_id INTEGER,
            details TEXT,
            user_name TEXT DEFAULT 'system',
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """
    )

    conn.commit()
    conn.close()


def log_change(
    action: str,
    object_type: str,
    object_id: int,
    details: str,
    user_name: str = "system",
):
    """Log changes to the change_log table."""
    conn = get_db_connection()
    conn.execute(
        "INSERT INTO change_log (action, object_type, object_id, details, "
        "user_name) VALUES (?, ?, ?, ?, ?)",
        (action, object_type, object_id, details, user_name),
    )
    conn.commit()
    conn.close()


def validate_ip_in_subnet(ip_str: str, subnet_str: str) -> bool:
    """Validate that an IP address is within a subnet."""
    try:
        ip = ipaddress.ip_address(ip_str)
        subnet = ipaddress.ip_network(subnet_str, strict=False)
        return ip in subnet
    except (ipaddress.AddressValueError, ipaddress.NetmaskValueError):
        return False


def check_subnet_overlap(
    new_subnet: str, supernet_id: int, exclude_subnet_id: int = None
) -> bool:
    """Check if a new subnet overlaps with existing subnets in the same supernet."""
    try:
        new_network = ipaddress.ip_network(new_subnet, strict=False)
    except ipaddress.NetmaskValueError:
        return True  # Invalid subnet format

    conn = get_db_connection()
    query = "SELECT network FROM subnets WHERE supernet_id = ?"
    params = [supernet_id]

    if exclude_subnet_id:
        query += " AND id != ?"
        params.append(exclude_subnet_id)

    existing_subnets = conn.execute(query, params).fetchall()
    conn.close()

    for subnet_row in existing_subnets:
        try:
            existing_network = ipaddress.ip_network(subnet_row["network"], strict=False)
            if new_network.overlaps(existing_network):
                return True
        except ipaddress.NetmaskValueError:
            continue

    return False


def calculate_cidr_from_hosts(host_count: int) -> int:
    """Calculate the required CIDR prefix length for a given number of hosts."""
    import math
    total_addresses_needed = host_count + 2
    bits_needed = math.ceil(math.log2(total_addresses_needed))
    return 32 - bits_needed


def find_available_subnet(supernet_id: int, prefix_length: int) -> str | None:
    """Find the first available subnet of specified size within a supernet."""
    conn = get_db_connection()
    
    supernet = conn.execute(
        "SELECT network FROM supernets WHERE id = ?", (supernet_id,)
    ).fetchone()
    if not supernet:
        conn.close()
        return None
    
    try:
        supernet_network = ipaddress.ip_network(supernet["network"], strict=False)
    except ipaddress.NetmaskValueError:
        conn.close()
        return None
    
    existing_subnets = conn.execute(
        "SELECT network FROM subnets WHERE supernet_id = ?", (supernet_id,)
    ).fetchall()
    conn.close()
    
    existing_networks = []
    for subnet_row in existing_subnets:
        try:
            existing_networks.append(ipaddress.ip_network(subnet_row["network"], strict=False))
        except ipaddress.NetmaskValueError:
            continue
    
    try:
        for candidate_subnet in supernet_network.subnets(new_prefix=prefix_length):
            overlaps = False
            for existing_network in existing_networks:
                if candidate_subnet.overlaps(existing_network):
                    overlaps = True
                    break
            
            if not overlaps:
                return str(candidate_subnet)
    except ValueError:
        return None
    
    return None  # No available subnet found


@app.route("/login", methods=["GET", "POST"])
def login():
    """Login page and authentication."""
    if request.method == "POST":
        username = request.form.get("username")
        password = request.form.get("password")
        
        valid_username = os.environ.get("LOGIN_USERNAME", "admin")
        valid_password = os.environ.get("LOGIN_PASSWORD", "password")
        
        if username == valid_username and password == valid_password:
            session["logged_in"] = True
            session["username"] = username
            return redirect(url_for("index"))
        else:
            return render_template("login.html", error="Invalid credentials")
    
    return render_template("login.html")


@app.route("/logout")
def logout():
    """Logout and clear session."""
    session.clear()
    return redirect(url_for("login"))


@app.route("/")
@login_required
def index():
    """Main dashboard page."""
    return render_template("index.html")


@app.route("/api/supernets", methods=["GET", "POST"])
@login_required
def handle_supernets():
    """Handle supernet operations."""
    if request.method == "GET":
        conn = get_db_connection()
        supernets = conn.execute(
            "SELECT * FROM supernets ORDER BY created_at DESC"
        ).fetchall()
        conn.close()

        result = []
        for supernet in supernets:
            try:
                network = ipaddress.ip_network(supernet["network"], strict=False)
                result.append(
                    {
                        "id": supernet["id"],
                        "network": supernet["network"],
                        "name": supernet["name"],
                        "description": supernet["description"],
                        "start_ip": str(network.network_address),
                        "end_ip": str(network.broadcast_address),
                        "total_hosts": network.num_addresses
                        - 2,  # Exclude network and broadcast
                        "created_at": supernet["created_at"],
                    }
                )
            except ipaddress.NetmaskValueError:
                continue

        return jsonify(result)

    elif request.method == "POST":
        data = request.get_json()
        network = data.get("network")
        name = data.get("name", "")
        description = data.get("description", "")

        try:
            ipaddress.ip_network(network, strict=False)
        except ipaddress.NetmaskValueError:
            return jsonify({"error": "Invalid network format"}), 400

        conn = get_db_connection()
        try:
            cursor = conn.execute(
                "INSERT INTO supernets (network, name, description) VALUES (?, ?, ?)",
                (network, name, description),
            )
            supernet_id = cursor.lastrowid
            conn.commit()
            log_change("CREATE", "supernet", supernet_id, f"Created supernet {network}")
            return (
                jsonify(
                    {"id": supernet_id, "message": "Supernet created successfully"}
                ),
                201,
            )
        except sqlite3.IntegrityError:
            return jsonify({"error": "Supernet already exists"}), 400
        finally:
            conn.close()


@app.route("/api/subnets", methods=["GET", "POST"])
@login_required
def handle_subnets():
    """Handle subnet operations."""
    if request.method == "GET":
        supernet_id = request.args.get("supernet_id")
        conn = get_db_connection()

        if supernet_id:
            query = """
                SELECT s.*, sup.network as supernet_network
                FROM subnets s
                JOIN supernets sup ON s.supernet_id = sup.id
                WHERE s.supernet_id = ?
                ORDER BY s.created_at DESC
            """
            subnets = conn.execute(query, (supernet_id,)).fetchall()
        else:
            query = """
                SELECT s.*, sup.network as supernet_network
                FROM subnets s
                JOIN supernets sup ON s.supernet_id = sup.id
                ORDER BY s.created_at DESC
            """
            subnets = conn.execute(query).fetchall()

        conn.close()

        result = []
        for subnet in subnets:
            try:
                network = ipaddress.ip_network(subnet["network"], strict=False)

                conn = get_db_connection()
                used_ips = conn.execute(
                    "SELECT COUNT(*) as count FROM devices WHERE subnet_id = ?",
                    (subnet["id"],),
                ).fetchone()["count"]
                conn.close()

                total_hosts = network.num_addresses - 2  # Exclude network and broadcast
                utilization = (used_ips / total_hosts * 100) if total_hosts > 0 else 0

                result.append(
                    {
                        "id": subnet["id"],
                        "supernet_id": subnet["supernet_id"],
                        "supernet_network": subnet["supernet_network"],
                        "network": subnet["network"],
                        "name": subnet["name"],
                        "purpose": subnet["purpose"],
                        "assigned_to": subnet["assigned_to"],
                        "gateway": subnet["gateway"],
                        "start_ip": str(network.network_address),
                        "end_ip": str(network.broadcast_address),
                        "total_hosts": total_hosts,
                        "used_ips": used_ips,
                        "available_ips": total_hosts - used_ips,
                        "utilization": round(utilization, 2),
                        "created_at": subnet["created_at"],
                    }
                )
            except ipaddress.NetmaskValueError:
                continue

        return jsonify(result)

    elif request.method == "POST":
        data = request.get_json()
        supernet_id = data.get("supernet_id")
        network = data.get("network")
        name = data.get("name")
        purpose = data.get("purpose", "")
        assigned_to = data.get("assigned_to", "")
        gateway = data.get("gateway", "")

        if not all([supernet_id, network, name]):
            return jsonify({"error": "Missing required fields"}), 400

        try:
            subnet_network = ipaddress.ip_network(network, strict=False)
        except ipaddress.NetmaskValueError:
            return jsonify({"error": "Invalid subnet format"}), 400

        if gateway and not validate_ip_in_subnet(gateway, network):
            return jsonify({"error": "Gateway must be within subnet range"}), 400

        conn = get_db_connection()
        supernet = conn.execute(
            "SELECT network FROM supernets WHERE id = ?", (supernet_id,)
        ).fetchone()
        if not supernet:
            conn.close()
            return jsonify({"error": "Supernet not found"}), 404

        try:
            supernet_network = ipaddress.ip_network(supernet["network"], strict=False)
            if not supernet_network.supernet_of(subnet_network):
                conn.close()
                return jsonify({"error": "Subnet must be within supernet range"}), 400
        except ipaddress.NetmaskValueError:
            conn.close()
            return jsonify({"error": "Invalid supernet format"}), 400

        if check_subnet_overlap(network, supernet_id):
            conn.close()
            return jsonify({"error": "Subnet overlaps with existing subnet"}), 400

        try:
            cursor = conn.execute(
                "INSERT INTO subnets (supernet_id, network, name, "
                "purpose, assigned_to, gateway) VALUES (?, ?, ?, ?, ?, ?)",
                (supernet_id, network, name, purpose, assigned_to, gateway),
            )
            subnet_id = cursor.lastrowid
            conn.commit()
            log_change(
                "CREATE",
                "subnet",
                subnet_id,
                f'Created subnet {network} in supernet {supernet["network"]}',
            )
            return (
                jsonify({"id": subnet_id, "message": "Subnet created successfully"}),
                201,
            )
        except sqlite3.IntegrityError:
            return jsonify({"error": "Subnet already exists"}), 400
        finally:
            conn.close()


@app.route("/api/supernets/<int:supernet_id>/allocate", methods=["POST"])
@login_required
def allocate_subnet(supernet_id):
    """Intelligently allocate a subnet within a supernet."""
    data = request.get_json()
    allocation_mode = data.get("mode")  # "by_mask" or "by_hosts"
    name = data.get("name")
    purpose = data.get("purpose", "")
    assigned_to = data.get("assigned_to", "")
    
    if not all([allocation_mode, name]):
        return jsonify({"error": "Missing required fields"}), 400
    
    if allocation_mode == "by_mask":
        prefix_length = data.get("prefix_length")
        if not prefix_length or not isinstance(prefix_length, int) or prefix_length < 1 or prefix_length > 32:
            return jsonify({"error": "Valid prefix_length required for by_mask mode"}), 400
    elif allocation_mode == "by_hosts":
        host_count = data.get("host_count")
        if not host_count or not isinstance(host_count, int) or host_count < 1:
            return jsonify({"error": "Valid host_count required for by_hosts mode"}), 400
        prefix_length = calculate_cidr_from_hosts(host_count)
    else:
        return jsonify({"error": "Invalid allocation mode. Use 'by_mask' or 'by_hosts'"}), 400
    
    conn = get_db_connection()
    supernet = conn.execute(
        "SELECT network FROM supernets WHERE id = ?", (supernet_id,)
    ).fetchone()
    if not supernet:
        conn.close()
        return jsonify({"error": "Supernet not found"}), 404
    
    available_subnet = find_available_subnet(supernet_id, prefix_length)
    if not available_subnet:
        conn.close()
        return jsonify({
            "error": f"No available /{prefix_length} subnet found in supernet {supernet['network']}"
        }), 400
    
    try:
        subnet_network = ipaddress.ip_network(available_subnet, strict=False)
        gateway = str(list(subnet_network.hosts())[0]) if list(subnet_network.hosts()) else str(subnet_network.network_address + 1)
    except (ipaddress.NetmaskValueError, IndexError):
        gateway = ""
    
    try:
        cursor = conn.execute(
            "INSERT INTO subnets (supernet_id, network, name, purpose, assigned_to, gateway) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (supernet_id, available_subnet, name, purpose, assigned_to, gateway),
        )
        subnet_id = cursor.lastrowid
        conn.commit()
        log_change(
            "CREATE",
            "subnet",
            subnet_id,
            f'Auto-allocated subnet {available_subnet} in supernet {supernet["network"]} ({allocation_mode})',
        )
        
        return jsonify({
            "id": subnet_id,
            "network": available_subnet,
            "gateway": gateway,
            "message": f"Subnet allocated successfully using {allocation_mode} mode"
        }), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Subnet allocation failed due to conflict"}), 400
    finally:
        conn.close()


@app.route("/api/devices", methods=["GET", "POST"])
@login_required
def handle_devices():
    """Handle device operations."""
    if request.method == "GET":
        subnet_id = request.args.get("subnet_id")
        conn = get_db_connection()

        if subnet_id:
            query = """
                SELECT d.*, s.network as subnet_network, s.name as subnet_name
                FROM devices d
                JOIN subnets s ON d.subnet_id = s.id
                WHERE d.subnet_id = ?
                ORDER BY d.created_at DESC
            """
            devices = conn.execute(query, (subnet_id,)).fetchall()
        else:
            query = """
                SELECT d.*, s.network as subnet_network, s.name as subnet_name
                FROM devices d
                JOIN subnets s ON d.subnet_id = s.id
                ORDER BY d.created_at DESC
            """
            devices = conn.execute(query).fetchall()

        conn.close()

        result = []
        for device in devices:
            result.append(
                {
                    "id": device["id"],
                    "subnet_id": device["subnet_id"],
                    "subnet_network": device["subnet_network"],
                    "subnet_name": device["subnet_name"],
                    "device_name": device["device_name"],
                    "role": device["role"],
                    "location": device["location"],
                    "ip_address": device["ip_address"],
                    "hostname": device["hostname"],
                    "created_at": device["created_at"],
                }
            )

        return jsonify(result)

    elif request.method == "POST":
        data = request.get_json()
        subnet_id = data.get("subnet_id")
        device_name = data.get("device_name")
        role = data.get("role", "")
        location = data.get("location", "")
        ip_address = data.get("ip_address")
        hostname = data.get("hostname", "")

        if not all([subnet_id, device_name, ip_address]):
            return jsonify({"error": "Missing required fields"}), 400

        conn = get_db_connection()
        subnet = conn.execute(
            "SELECT network FROM subnets WHERE id = ?", (subnet_id,)
        ).fetchone()
        if not subnet:
            conn.close()
            return jsonify({"error": "Subnet not found"}), 404

        if not validate_ip_in_subnet(ip_address, subnet["network"]):
            conn.close()
            return jsonify({"error": "IP address must be within subnet range"}), 400

        try:
            cursor = conn.execute(
                "INSERT INTO devices (subnet_id, device_name, role, "
                "location, ip_address, hostname) VALUES (?, ?, ?, ?, ?, ?)",
                (subnet_id, device_name, role, location, ip_address, hostname),
            )
            device_id = cursor.lastrowid
            conn.commit()
            log_change(
                "CREATE",
                "device",
                device_id,
                f"Assigned IP {ip_address} to device {device_name}",
            )
            return (
                jsonify({"id": device_id, "message": "Device created successfully"}),
                201,
            )
        except sqlite3.IntegrityError:
            return jsonify({"error": "IP address already assigned"}), 400
        finally:
            conn.close()


@app.route("/api/supernets/<int:supernet_id>", methods=["DELETE"])
@login_required
def delete_supernet(supernet_id):
    """Delete a supernet and all associated subnets and devices."""
    conn = get_db_connection()

    supernet = conn.execute(
        "SELECT * FROM supernets WHERE id = ?", (supernet_id,)
    ).fetchone()
    if not supernet:
        conn.close()
        return jsonify({"error": "Supernet not found"}), 404

    try:
        conn.execute(
            "DELETE FROM devices WHERE subnet_id IN "
            "(SELECT id FROM subnets WHERE supernet_id = ?)",
            (supernet_id,),
        )
        conn.execute("DELETE FROM subnets WHERE supernet_id = ?", (supernet_id,))
        conn.execute("DELETE FROM supernets WHERE id = ?", (supernet_id,))
        conn.commit()
        log_change(
            "DELETE",
            "supernet",
            supernet_id,
            f'Deleted supernet {supernet["network"]}',
        )
        return jsonify({"message": "Supernet deleted successfully"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/subnets/<int:subnet_id>", methods=["DELETE"])
@login_required
def delete_subnet(subnet_id):
    """Delete a subnet and all associated devices."""
    conn = get_db_connection()

    subnet = conn.execute("SELECT * FROM subnets WHERE id = ?", (subnet_id,)).fetchone()
    if not subnet:
        conn.close()
        return jsonify({"error": "Subnet not found"}), 404

    try:
        conn.execute("DELETE FROM devices WHERE subnet_id = ?", (subnet_id,))
        conn.execute("DELETE FROM subnets WHERE id = ?", (subnet_id,))
        conn.commit()
        log_change("DELETE", "subnet", subnet_id, f'Deleted subnet {subnet["network"]}')
        return jsonify({"message": "Subnet deleted successfully"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/devices/<int:device_id>", methods=["DELETE"])
@login_required
def delete_device(device_id):
    """Delete a device."""
    conn = get_db_connection()

    device = conn.execute("SELECT * FROM devices WHERE id = ?", (device_id,)).fetchone()
    if not device:
        conn.close()
        return jsonify({"error": "Device not found"}), 404

    try:
        conn.execute("DELETE FROM devices WHERE id = ?", (device_id,))
        conn.commit()
        log_change(
            "DELETE",
            "device",
            device_id,
            f'Deleted device {device["device_name"]} ' f'({device["ip_address"]})',
        )
        return jsonify({"message": "Device deleted successfully"})
    except Exception as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        conn.close()


@app.route("/api/export")
@login_required
def export_data():
    """Export all data to CSV format."""
    import csv
    import io

    output = io.StringIO()
    writer = csv.writer(output)

    conn = get_db_connection()

    writer.writerow(
        [
            "Type",
            "ID",
            "Network/IP",
            "Name",
            "Purpose/Role",
            "Location/Assigned To",
            "Gateway/Hostname",
            "Created",
        ]
    )

    supernets = conn.execute("SELECT * FROM supernets ORDER BY created_at").fetchall()
    for supernet in supernets:
        writer.writerow(
            [
                "Supernet",
                supernet["id"],
                supernet["network"],
                supernet["name"] or "",
                supernet["description"] or "",
                "",
                "",
                supernet["created_at"],
            ]
        )

    subnets = conn.execute(
        """
        SELECT s.*, sup.network as supernet_network
        FROM subnets s
        JOIN supernets sup ON s.supernet_id = sup.id
        ORDER BY s.created_at
    """
    ).fetchall()
    for subnet in subnets:
        writer.writerow(
            [
                "Subnet",
                subnet["id"],
                subnet["network"],
                subnet["name"],
                subnet["purpose"] or "",
                subnet["assigned_to"] or "",
                subnet["gateway"] or "",
                subnet["created_at"],
            ]
        )

    devices = conn.execute(
        """
        SELECT d.*, s.network as subnet_network
        FROM devices d
        JOIN subnets s ON d.subnet_id = s.id
        ORDER BY d.created_at
    """
    ).fetchall()
    for device in devices:
        writer.writerow(
            [
                "Device",
                device["id"],
                device["ip_address"],
                device["device_name"],
                device["role"] or "",
                device["location"] or "",
                device["hostname"] or "",
                device["created_at"],
            ]
        )

    conn.close()

    output.seek(0)
    return app.response_class(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=ip-tracker-export.csv"},
    )


@app.route("/api/import", methods=["POST"])
@login_required
def import_data():
    """Import data from CSV file."""
    import csv
    import io

    if "file" not in request.files:
        return jsonify({"error": "No file provided"}), 400

    file = request.files["file"]
    data_type = request.form.get("type")

    if not file or file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    if not data_type:
        return jsonify({"error": "Data type not specified"}), 400

    try:
        stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
        csv_input = csv.reader(stream)

        imported_count = 0
        conn = get_db_connection()

        if data_type == "supernets":
            next(csv_input)
            for row in csv_input:
                if len(row) >= 3:
                    try:
                        ipaddress.ip_network(row[0], strict=False)
                        cursor = conn.execute(
                            "INSERT INTO supernets (network, name, "
                            "description) VALUES (?, ?, ?)",
                            (
                                row[0],
                                row[1] if len(row) > 1 else "",
                                row[2] if len(row) > 2 else "",
                            ),
                        )
                        log_change(
                            "IMPORT",
                            "supernet",
                            cursor.lastrowid,
                            f"Imported supernet {row[0]}",
                        )
                        imported_count += 1
                    except (ipaddress.NetmaskValueError, sqlite3.IntegrityError):
                        continue

        elif data_type == "subnets":
            next(csv_input)
            for row in csv_input:
                if len(row) >= 3:
                    try:
                        ipaddress.ip_network(row[1], strict=False)
                        supernet = conn.execute(
                            "SELECT id FROM supernets WHERE network = ?", (row[0],)
                        ).fetchone()
                        if supernet and not check_subnet_overlap(
                            row[1], supernet["id"]
                        ):
                            cursor = conn.execute(
                                "INSERT INTO subnets (supernet_id, network, "
                                "name, purpose, assigned_to, gateway) "
                                "VALUES (?, ?, ?, ?, ?, ?)",
                                (
                                    supernet["id"],
                                    row[1],
                                    row[2],
                                    row[3] if len(row) > 3 else "",
                                    row[4] if len(row) > 4 else "",
                                    row[5] if len(row) > 5 else "",
                                ),
                            )
                            log_change(
                                "IMPORT",
                                "subnet",
                                cursor.lastrowid,
                                f"Imported subnet {row[1]}",
                            )
                            imported_count += 1
                    except (ipaddress.NetmaskValueError, sqlite3.IntegrityError):
                        continue

        elif data_type == "devices":
            next(csv_input)
            for row in csv_input:
                if len(row) >= 3:
                    try:
                        subnet = conn.execute(
                            "SELECT id, network FROM subnets WHERE network = ?",
                            (row[0],),
                        ).fetchone()
                        if subnet and validate_ip_in_subnet(row[2], subnet["network"]):
                            cursor = conn.execute(
                                "INSERT INTO devices (subnet_id, device_name, "
                                "ip_address, hostname, role, location) "
                                "VALUES (?, ?, ?, ?, ?, ?)",
                                (
                                    subnet["id"],
                                    row[1],
                                    row[2],
                                    row[3] if len(row) > 3 else "",
                                    row[4] if len(row) > 4 else "",
                                    row[5] if len(row) > 5 else "",
                                ),
                            )
                            log_change(
                                "IMPORT",
                                "device",
                                cursor.lastrowid,
                                f"Imported device {row[1]} ({row[2]})",
                            )
                            imported_count += 1
                    except (ipaddress.AddressValueError, sqlite3.IntegrityError):
                        continue

        conn.commit()
        conn.close()

        return jsonify(
            {"message": "Import completed successfully", "imported": imported_count}
        )

    except Exception as e:
        return jsonify({"error": f"Import failed: {str(e)}"}), 500


@app.route("/api/dashboard")
@login_required
def dashboard_stats():
    """Get dashboard statistics."""
    conn = get_db_connection()

    supernet_count = conn.execute("SELECT COUNT(*) as count FROM supernets").fetchone()[
        "count"
    ]

    subnet_count = conn.execute("SELECT COUNT(*) as count FROM subnets").fetchone()[
        "count"
    ]

    device_count = conn.execute("SELECT COUNT(*) as count FROM devices").fetchone()[
        "count"
    ]

    recent_changes = conn.execute(
        "SELECT * FROM change_log ORDER BY timestamp DESC LIMIT 10"
    ).fetchall()

    conn.close()

    changes = []
    for change in recent_changes:
        changes.append(
            {
                "id": change["id"],
                "action": change["action"],
                "object_type": change["object_type"],
                "object_id": change["object_id"],
                "details": change["details"],
                "user_name": change["user_name"],
                "timestamp": change["timestamp"],
            }
        )

    return jsonify(
        {
            "supernet_count": supernet_count,
            "subnet_count": subnet_count,
            "device_count": device_count,
            "recent_changes": changes,
        }
    )


if __name__ == "__main__":
    init_database()
    app.run(debug=True, host="0.0.0.0", port=5000)
