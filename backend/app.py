"""
IP Tracker and Subnet Management Tool
A Flask web application for managing IP address allocations and subnet management.
"""

import ipaddress
import sqlite3

from flask import Flask, jsonify, request, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

import os
DATABASE = os.getenv("DATABASE_PATH", "/app/data/ip_tracker.db")


def get_db_connection():
    """Get database connection with row factory for dict-like access."""
    try:
        conn = sqlite3.connect(DATABASE, timeout=30.0)
        conn.row_factory = sqlite3.Row
        
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        conn.execute("PRAGMA cache_size=1000")
        conn.execute("PRAGMA temp_store=memory")
        conn.execute("PRAGMA foreign_keys=ON")
        
        return conn
    except Exception as e:
        print(f"Database connection error: {e}")
        raise


def init_database():
    """Initialize the database with required tables."""
    import os
    import time
    
    db_dir = os.path.dirname(DATABASE)
    os.makedirs(db_dir, exist_ok=True)
    print(f"Database directory ensured: {db_dir}")
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            conn = get_db_connection()
            print(f"Database initialized at: {DATABASE} (attempt {attempt + 1})")
            break
        except Exception as e:
            print(f"Database connection attempt {attempt + 1} failed: {e}")
            if attempt == max_retries - 1:
                raise
            time.sleep(1)
    
    try:

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
        print("Database tables created successfully")
    except Exception as e:
        print(f"Database initialization error: {e}")
        raise
    finally:
        if 'conn' in locals():
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
    
    return None


@app.route("/")
def index():
    """API information endpoint."""
    return jsonify({
        "message": "IP Tracker API",
        "version": "1.0.0",
        "endpoints": {
            "dashboard": "/api/dashboard",
            "supernets": "/api/supernets",
            "subnets": "/api/subnets", 
            "devices": "/api/devices",
            "export": "/api/export",
            "import": "/api/import"
        }
    })


@app.route("/api/supernets", methods=["GET", "POST"])
def handle_supernets():
    """Handle supernet operations."""
    if request.method == "GET":
        conn = get_db_connection()
        supernets = conn.execute(
            "SELECT * FROM supernets ORDER BY created_at DESC"
        ).fetchall()

        result = []
        for supernet in supernets:
            try:
                network = ipaddress.ip_network(supernet["network"], strict=False)
                
                subnets_in_supernet = conn.execute(
                    "SELECT * FROM subnets WHERE supernet_id = ?", (supernet["id"],)
                ).fetchall()
                
                total_used_ips = 0
                total_subnet_hosts = 0
                subnet_list = []
                
                for subnet in subnets_in_supernet:
                    subnet_network = ipaddress.ip_network(subnet["network"], strict=False)
                    subnet_hosts = subnet_network.num_addresses - 2
                    used_ips = conn.execute(
                        "SELECT COUNT(*) as count FROM devices WHERE subnet_id = ?",
                        (subnet["id"],),
                    ).fetchone()["count"]
                    
                    total_used_ips += used_ips
                    total_subnet_hosts += subnet_hosts
                    
                    subnet_list.append({
                        "id": subnet["id"],
                        "network": subnet["network"],
                        "name": subnet["name"]
                    })
                
                total_hosts = network.num_addresses - 2
                available_ips = total_subnet_hosts - total_used_ips
                utilization = (total_used_ips / total_subnet_hosts * 100) if total_subnet_hosts > 0 else 0
                
                result.append(
                    {
                        "id": supernet["id"],
                        "network": supernet["network"],
                        "name": supernet["name"],
                        "description": supernet["description"],
                        "start_ip": str(network.network_address),
                        "end_ip": str(network.broadcast_address),
                        "total_hosts": total_hosts,
                        "used_ips": total_used_ips,
                        "available_ips": available_ips,
                        "utilization": round(utilization, 2),
                        "created_at": supernet["created_at"],
                        "subnet_count": len(subnet_list),
                        "subnets": subnet_list,
                    }
                )
            except ipaddress.NetmaskValueError:
                continue

        conn.close()
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
        gateway_mode = data.get("gateway_mode", "auto")

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
def allocate_subnet(supernet_id):
    """Intelligently allocate a subnet within a supernet."""
    data = request.get_json()
    allocation_mode = data.get("mode")
    name = data.get("name")
    purpose = data.get("purpose", "")
    assigned_to = data.get("assigned_to", "")
    gateway_mode = data.get("gateway_mode", "auto")
    
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
    
    if gateway_mode == "not_applicable":
        gateway = ""
    else:
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


@app.route("/api/supernets/<int:supernet_id>", methods=["DELETE", "PUT"])
def handle_supernet_by_id(supernet_id):
    """Handle supernet operations by ID."""
    if request.method == "DELETE":
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
    
    elif request.method == "PUT":
        """Update a supernet."""
        data = request.get_json()
        network = data.get("network")
        name = data.get("name", "")
        description = data.get("description", "")

        if not network or not name:
            return jsonify({"error": "Missing required fields"}), 400

        try:
            ipaddress.ip_network(network, strict=False)
        except ipaddress.NetmaskValueError:
            return jsonify({"error": "Invalid network format"}), 400

        conn = get_db_connection()
        
        supernet = conn.execute(
            "SELECT * FROM supernets WHERE id = ?", (supernet_id,)
        ).fetchone()
        if not supernet:
            conn.close()
            return jsonify({"error": "Supernet not found"}), 404

        try:
            existing = conn.execute(
                "SELECT id FROM supernets WHERE network = ? AND id != ?", 
                (network, supernet_id)
            ).fetchone()
            if existing:
                conn.close()
                return jsonify({"error": "Supernet network already exists"}), 400

            conn.execute(
                "UPDATE supernets SET network = ?, name = ?, description = ? WHERE id = ?",
                (network, name, description, supernet_id),
            )
            conn.commit()
            log_change(
                "UPDATE", 
                "supernet", 
                supernet_id, 
                f"Updated supernet {supernet['network']} to {network}"
            )
            return jsonify({"message": "Supernet updated successfully"})
        except sqlite3.IntegrityError:
            return jsonify({"error": "Supernet network already exists"}), 400
        finally:
            conn.close()


@app.route("/api/subnets/<int:subnet_id>", methods=["DELETE", "PUT"])
def handle_subnet_by_id(subnet_id):
    """Handle subnet operations by ID."""
    if request.method == "DELETE":
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
    
    elif request.method == "PUT":
        """Update a subnet."""
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
        
        subnet = conn.execute("SELECT * FROM subnets WHERE id = ?", (subnet_id,)).fetchone()
        if not subnet:
            conn.close()
            return jsonify({"error": "Subnet not found"}), 404

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

        if check_subnet_overlap(network, supernet_id, exclude_subnet_id=subnet_id):
            conn.close()
            return jsonify({"error": "Subnet overlaps with existing subnet"}), 400

        try:
            conn.execute(
                "UPDATE subnets SET supernet_id = ?, network = ?, name = ?, "
                "purpose = ?, assigned_to = ?, gateway = ? WHERE id = ?",
                (supernet_id, network, name, purpose, assigned_to, gateway, subnet_id),
            )
            conn.commit()
            log_change(
                "UPDATE",
                "subnet",
                subnet_id,
                f'Updated subnet {subnet["network"]} to {network}',
            )
            return jsonify({"message": "Subnet updated successfully"})
        except sqlite3.IntegrityError:
            return jsonify({"error": "Subnet network already exists"}), 400
        finally:
            conn.close()


@app.route("/api/devices/<int:device_id>", methods=["DELETE", "PUT"])
def handle_device_by_id(device_id):
    """Handle device operations by ID."""
    if request.method == "DELETE":
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
    
    elif request.method == "PUT":
        """Update a device."""
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
        
        device = conn.execute("SELECT * FROM devices WHERE id = ?", (device_id,)).fetchone()
        if not device:
            conn.close()
            return jsonify({"error": "Device not found"}), 404

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
            existing = conn.execute(
                "SELECT id FROM devices WHERE ip_address = ? AND id != ?", 
                (ip_address, device_id)
            ).fetchone()
            if existing:
                conn.close()
                return jsonify({"error": "IP address already assigned"}), 400

            conn.execute(
                "UPDATE devices SET subnet_id = ?, device_name = ?, role = ?, "
                "location = ?, ip_address = ?, hostname = ? WHERE id = ?",
                (subnet_id, device_name, role, location, ip_address, hostname, device_id),
            )
            conn.commit()
            log_change(
                "UPDATE",
                "device",
                device_id,
                f"Updated device {device['device_name']} to {device_name} ({ip_address})",
            )
            return jsonify({"message": "Device updated successfully"})
        except sqlite3.IntegrityError:
            return jsonify({"error": "IP address already assigned"}), 400
        finally:
            conn.close()


@app.route("/api/export")
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

    high_utilization_subnets = conn.execute(
        """SELECT s.*, (
            SELECT COUNT(*) FROM devices WHERE subnet_id = s.id
        ) as used_ips FROM subnets s"""
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
    
    critical_subnets = []
    warning_subnets = []
    total_utilization = 0
    subnet_count_with_data = 0
    
    for subnet in high_utilization_subnets:
        try:
            network = ipaddress.ip_network(subnet["network"], strict=False)
            total_hosts = network.num_addresses - 2
            utilization = (subnet["used_ips"] / total_hosts * 100) if total_hosts > 0 else 0
            
            total_utilization += utilization
            subnet_count_with_data += 1
            
            if utilization >= 90:
                critical_subnets.append({"name": subnet["name"], "network": subnet["network"], "utilization": round(utilization, 1)})
            elif utilization >= 75:
                warning_subnets.append({"name": subnet["name"], "network": subnet["network"], "utilization": round(utilization, 1)})
        except ipaddress.NetmaskValueError:
            continue
    
    avg_utilization = round(total_utilization / subnet_count_with_data) if subnet_count_with_data > 0 else 0

    return jsonify(
        {
            "supernet_count": supernet_count,
            "subnet_count": subnet_count,
            "device_count": device_count,
            "avg_utilization": avg_utilization,
            "critical_subnets": critical_subnets[:5],
            "warning_subnets": warning_subnets[:5],
            "network_health": "critical" if critical_subnets else "warning" if warning_subnets else "healthy",
            "recent_changes": changes,
        }
    )


@app.route("/api/changelog", methods=["GET"])
def get_changelog():
    """Get change log entries."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, action, object_type, object_id, details, user_name, timestamp
            FROM change_log 
            ORDER BY timestamp DESC 
            LIMIT 100
        """)
        
        changelog = []
        for row in cursor.fetchall():
            changelog.append({
                "id": row[0],
                "action": row[1],
                "object_type": row[2],
                "object_id": row[3],
                "details": row[4],
                "user_name": row[5],
                "timestamp": row[6]
            })
        
        conn.close()
        return jsonify(changelog)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint to verify database connectivity."""
    try:
        conn = get_db_connection()
        
        cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        required_tables = ['supernets', 'subnets', 'devices', 'change_log']
        
        missing_tables = [table for table in required_tables if table not in tables]
        if missing_tables:
            return jsonify({
                "status": "error",
                "message": f"Missing tables: {missing_tables}",
                "database_path": DATABASE
            }), 500
        
        cursor = conn.execute("SELECT COUNT(*) as count FROM supernets")
        supernet_count = cursor.fetchone()[0]
        
        cursor = conn.execute("SELECT COUNT(*) as count FROM subnets")
        subnet_count = cursor.fetchone()[0]
        
        conn.close()
        
        return jsonify({
            "status": "healthy",
            "database_path": DATABASE,
            "tables": tables,
            "supernet_count": supernet_count,
            "subnet_count": subnet_count
        })
        
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": str(e),
            "database_path": DATABASE
        }), 500


if __name__ == "__main__":
    init_database()
    app.run(debug=True, host="0.0.0.0", port=5000)
