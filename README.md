# IP Tracker and Subnet Management Tool

A comprehensive web-based IP address tracking and subnet management system built with Flask backend and Bootstrap frontend. Manage supernets, allocate subnets, assign device IPs, and track utilization with validation and export/import functionality.

## Features

### Core Functionality
- **Supernet Management**: Create and manage /16 networks (e.g., 10.10.0.0/16)
- **Subnet Allocation**: Create subnets within supernets with overlap prevention
- **Device IP Assignment**: Assign IPs to devices with validation
- **Dashboard Statistics**: Real-time utilization tracking and statistics
- **Enhanced Subnet Display**: Total hosts, utilization percentage, and available IPs columns
- **Export/Import**: CSV export/import for data management
- **Change Logging**: Audit trail for all modifications

### Validation Rules
- Prevent overlapping subnets automatically
- Ensure IPs are within subnet ranges
- Prevent duplicate IP assignments (built-in IP conflict detection)
- Validate gateway IPs within subnet ranges
- Real-time utilization calculations and availability tracking

### Technical Stack
- **Backend**: Flask with SQLite database
- **Frontend**: Bootstrap 5 with responsive design
- **Validation**: Python `ipaddress` module
- **Deployment**: Docker-ready with Fly.io configuration

## Quick Start

### Prerequisites
- Python 3.11+
- Flask 2.3+

### Installation

1. Clone the repository:
```bash
git clone https://github.com/ee-aadishbahati/ip-tracker.git
cd ip-tracker
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

3. Run the application:
```bash
python app.py
```

4. Open your browser and navigate to:
```
http://localhost:5000
```

## Usage

### Creating Supernets
1. Click "Add Supernet" button
2. Enter network in CIDR notation (e.g., `10.10.0.0/16`)
3. Provide name and description
4. Click "Save Supernet"

### Allocating Subnets
1. Click "Add Subnet" button
2. Select parent supernet
3. Enter subnet CIDR (e.g., `10.10.1.0/24`)
4. Provide name, purpose, and gateway IP
5. Click "Save Subnet"

### Assigning Device IPs
1. Click "Add Device" button
2. Select target subnet
3. Enter device details and IP address
4. Click "Save Device"

### Export/Import Data
- Use "Export" button to download CSV data
- Use "Import" button to upload CSV files
- Supports supernets, subnets, and devices data

## Deployment

### Local Development
```bash
python app.py
```
Application runs on `http://localhost:5000` with debug mode enabled.

### Production Deployment (Fly.io)
```bash
fly deploy
```

The application includes:
- `Dockerfile` for containerization
- `fly.toml` for Fly.io configuration
- Production-ready Flask settings

## API Endpoints

- `GET /api/supernets` - List all supernets
- `POST /api/supernets` - Create new supernet
- `GET /api/subnets` - List all subnets
- `POST /api/subnets` - Create new subnet
- `GET /api/devices` - List all devices
- `POST /api/devices` - Create new device
- `GET /api/export` - Export data as CSV
- `POST /api/import` - Import data from CSV
- `GET /api/dashboard` - Get dashboard statistics

## Database Schema

### Supernets
- `id`, `network`, `name`, `description`, `created_at`

### Subnets
- `id`, `supernet_id`, `network`, `name`, `purpose`, `assigned_to`, `gateway`, `created_at`

### Devices
- `id`, `subnet_id`, `device_name`, `ip_address`, `hostname`, `role`, `location`, `created_at`

### Change Log
- `id`, `action`, `object_type`, `object_id`, `details`, `user_name`, `timestamp`

## Development

### Linting and Code Quality
```bash
# Format code
python -m black app.py

# Check style
python -m flake8 app.py

# Sort imports
python -m isort app.py

# Type checking
python -m mypy app.py
```

### Project Structure
```
ip-tracker/
├── app.py                 # Main Flask application
├── templates/
│   ├── base.html         # Bootstrap base template
│   └── index.html        # Main dashboard
├── static/
│   ├── css/style.css     # Custom styles
│   └── js/app.js         # Frontend JavaScript
├── requirements.txt      # Python dependencies
├── Dockerfile           # Container configuration
├── fly.toml            # Fly.io deployment config
└── README.md           # This file
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run linting tools
5. Submit a pull request

## License

This project is licensed under the MIT License.
