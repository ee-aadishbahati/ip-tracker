
const API_BASE_URL = 'https://ip-tracker.fly.dev';

let supernets = [];
let subnets = [];
let devices = [];
let changelog = [];

document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    loadDashboard();
});

function setupEventListeners() {
    const supernetSearch = document.getElementById('supernetSearch');
    const subnetSearch = document.getElementById('subnetSearch');
    const deviceSearch = document.getElementById('deviceSearch');
    const subnetSupernetFilter = document.getElementById('subnetSupernetFilter');
    const deviceSubnetFilter = document.getElementById('deviceSubnetFilter');
    
    if (supernetSearch) supernetSearch.addEventListener('input', filterSupernets);
    if (subnetSearch) subnetSearch.addEventListener('input', filterSubnets);
    if (deviceSearch) deviceSearch.addEventListener('input', filterDevices);
    if (subnetSupernetFilter) subnetSupernetFilter.addEventListener('change', filterSubnets);
    if (deviceSubnetFilter) deviceSubnetFilter.addEventListener('change', filterDevices);
    
    const mainTabs = document.getElementById('mainTabs');
    if (mainTabs) {
        mainTabs.addEventListener('shown.bs.tab', function(event) {
            const target = event.target.getAttribute('data-bs-target');
            if (target === '#subnets') {
                loadSubnets();
            } else if (target === '#devices') {
                loadDevices();
            } else if (target === '#changelog') {
                loadChangelog();
            }
        });
    }
}

async function apiCall(endpoint, method = 'GET', data = null) {
    try {
        const config = {
            method: method,
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        if (data) {
            config.body = JSON.stringify(data);
        }
        
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error('API call failed:', error);
        showAlert('Error communicating with server: ' + error.message, 'danger');
        throw error;
    }
}

async function loadDashboard() {
    try {
        const stats = await apiCall('/api/dashboard');
        
        document.getElementById('supernetCount').textContent = stats.supernet_count || 0;
        document.getElementById('subnetCount').textContent = stats.subnet_count || 0;
        document.getElementById('deviceCount').textContent = stats.device_count || 0;
        document.getElementById('avgUtilization').textContent = (stats.avg_utilization || 0) + '%';
        
        await loadSupernets();
        await loadSubnetFilters();
        await loadDeviceFilters();
    } catch (error) {
        console.error('Error loading dashboard:', error);
    }
}

async function loadSupernets() {
    try {
        supernets = await apiCall('/api/supernets');
        renderSupernets();
        updateSubnetDropdowns();
    } catch (error) {
        console.error('Error loading supernets:', error);
    }
}

function renderSupernets() {
    const tbody = document.getElementById('supernetsTable');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    supernets.forEach(supernet => {
        const row = document.createElement('tr');
        
        let subnetDisplay = '';
        if (supernet.subnet_count > 0) {
            subnetDisplay = `
                <span class="badge bg-primary">${supernet.subnet_count} subnet${supernet.subnet_count > 1 ? 's' : ''}</span>
                <button class="btn btn-sm btn-outline-info ms-1" onclick="toggleSubnetDetails(${supernet.id})" title="View subnets">
                    <i class="bi bi-eye"></i>
                </button>
            `;
        } else {
            subnetDisplay = '<span class="text-muted">No subnets</span>';
        }
        
        row.innerHTML = `
            <td><code>${supernet.network}</code></td>
            <td>${supernet.name}</td>
            <td>${supernet.description || ''}</td>
            <td><code>${supernet.start_ip}</code></td>
            <td><code>${supernet.end_ip}</code></td>
            <td>${supernet.total_hosts.toLocaleString()}</td>
            <td>${subnetDisplay}</td>
            <td>${new Date(supernet.created_at).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editSupernet(${supernet.id})" title="Edit">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteSupernet(${supernet.id})" title="Delete">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        
        row.dataset.supernetId = supernet.id;
        row.dataset.subnets = JSON.stringify(supernet.subnets || []);
        
        tbody.appendChild(row);
    });
}

function filterSupernets() {
    const searchTerm = document.getElementById('supernetSearch').value.toLowerCase();
    const rows = document.querySelectorAll('#supernetsTable tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

function showSupernetModal() {
    const modal = new bootstrap.Modal(document.getElementById('supernetModal'));
    document.getElementById('supernetForm').reset();
    document.getElementById('supernetModal').dataset.editId = '';
    document.querySelector('#supernetModal .modal-title').textContent = 'Add Supernet';
    document.querySelector('#supernetModal .btn-primary').textContent = 'Save Supernet';
    modal.show();
}

async function saveSupernetModal() {
    const network = document.getElementById('supernetNetwork').value;
    const name = document.getElementById('supernetName').value;
    const description = document.getElementById('supernetDescription').value;
    const editId = document.getElementById('supernetModal').dataset.editId;
    
    if (!network || !name) {
        showAlert('Please fill in all required fields', 'warning');
        return;
    }
    
    try {
        if (editId) {
            await apiCall(`/api/supernets/${editId}`, 'PUT', {
                network: network,
                name: name,
                description: description
            });
            showAlert('Supernet updated successfully', 'success');
        } else {
            await apiCall('/api/supernets', 'POST', {
                network: network,
                name: name,
                description: description
            });
            showAlert('Supernet created successfully', 'success');
        }
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('supernetModal'));
        modal.hide();
        
        await loadDashboard();
    } catch (error) {
        console.error('Error saving supernet:', error);
    }
}

async function editSupernet(id) {
    const supernet = supernets.find(s => s.id === id);
    if (!supernet) {
        showAlert('Supernet not found', 'error');
        return;
    }
    
    document.getElementById('supernetNetwork').value = supernet.network;
    document.getElementById('supernetName').value = supernet.name;
    document.getElementById('supernetDescription').value = supernet.description || '';
    document.getElementById('supernetModal').dataset.editId = id;
    document.querySelector('#supernetModal .modal-title').textContent = 'Edit Supernet';
    document.querySelector('#supernetModal .btn-primary').textContent = 'Update Supernet';
    
    const modal = new bootstrap.Modal(document.getElementById('supernetModal'));
    modal.show();
}

async function deleteSupernet(id) {
    if (!confirm('Are you sure you want to delete this supernet?')) {
        return;
    }
    
    try {
        await apiCall(`/api/supernets/${id}`, 'DELETE');
        showAlert('Supernet deleted successfully', 'success');
        await loadDashboard();
    } catch (error) {
        console.error('Error deleting supernet:', error);
    }
}

async function loadSubnets() {
    try {
        subnets = await apiCall('/api/subnets');
        renderSubnets();
    } catch (error) {
        console.error('Error loading subnets:', error);
    }
}

function renderSubnets() {
    const tbody = document.getElementById('subnetsTable');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    subnets.forEach(subnet => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><code>${subnet.network}</code></td>
            <td>${subnet.name}</td>
            <td>${subnet.purpose || ''}</td>
            <td>${subnet.assigned_to || ''}</td>
            <td><code>${subnet.gateway || ''}</code></td>
            <td><code>${subnet.start_ip}</code></td>
            <td><code>${subnet.end_ip}</code></td>
            <td>${subnet.total_hosts.toLocaleString()}</td>
            <td>${new Date(subnet.created_at).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editSubnet(${subnet.id})" title="Edit">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteSubnet(${subnet.id})" title="Delete">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterSubnets() {
    const searchTerm = document.getElementById('subnetSearch').value.toLowerCase();
    const supernetFilter = document.getElementById('subnetSupernetFilter').value;
    const rows = document.querySelectorAll('#subnetsTable tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const matchesSearch = text.includes(searchTerm);
        const matchesFilter = !supernetFilter || row.dataset.supernetId === supernetFilter;
        row.style.display = (matchesSearch && matchesFilter) ? '' : 'none';
    });
}

function showSubnetModal() {
    const modal = new bootstrap.Modal(document.getElementById('subnetModal'));
    document.getElementById('subnetForm').reset();
    document.getElementById('subnetModal').dataset.editId = '';
    document.querySelector('#subnetModal .modal-title').textContent = 'Add Subnet';
    document.querySelector('#subnetModal .btn-success').textContent = 'Save Subnet';
    updateSubnetDropdowns();
    
    setTimeout(() => {
        setupSubnetModeListeners();
        const manualMode = document.getElementById('manualMode');
        const manualFields = document.getElementById('manualFields');
        if (manualMode && manualFields) {
            manualMode.checked = true;
            manualFields.style.display = 'block';
            document.getElementById('subnetNetwork').setAttribute('required', 'required');
        }
    }, 100);
    
    modal.show();
}

function setupSubnetModeListeners() {
    const modeRadios = document.querySelectorAll('input[name="allocationMode"]');
    const manualFields = document.getElementById('manualFields');
    const byMaskFields = document.getElementById('byMaskFields');
    const byHostsFields = document.getElementById('byHostsFields');
    
    if (modeRadios.length > 0 && manualFields && byMaskFields && byHostsFields) {
        modeRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                manualFields.style.display = 'none';
                byMaskFields.style.display = 'none';
                byHostsFields.style.display = 'none';
                
                document.getElementById('subnetNetwork').removeAttribute('required');
                document.getElementById('subnetPrefixLength').removeAttribute('required');
                document.getElementById('subnetHostCount').removeAttribute('required');
                
                if (this.value === 'manual') {
                    manualFields.style.display = 'block';
                    document.getElementById('subnetNetwork').setAttribute('required', 'required');
                } else if (this.value === 'by_mask') {
                    byMaskFields.style.display = 'block';
                    document.getElementById('subnetPrefixLength').setAttribute('required', 'required');
                } else if (this.value === 'by_hosts') {
                    byHostsFields.style.display = 'block';
                    document.getElementById('subnetHostCount').setAttribute('required', 'required');
                }
            });
        });
    }
}

async function saveSubnetModal() {
    const supernetId = document.getElementById('subnetSupernet').value;
    const name = document.getElementById('subnetName').value;
    const purpose = document.getElementById('subnetPurpose').value;
    const assignedTo = document.getElementById('subnetAssignedTo').value;
    const editId = document.getElementById('subnetModal').dataset.editId;
    
    if (!supernetId || !name) {
        showAlert('Please fill in all required fields', 'warning');
        return;
    }
    
    try {
        if (editId) {
            const network = document.getElementById('subnetNetwork').value;
            const gateway = document.getElementById('subnetGateway').value;
            
            if (!network) {
                showAlert('Please fill in all required fields', 'warning');
                return;
            }
            
            await apiCall(`/api/subnets/${editId}`, 'PUT', {
                supernet_id: parseInt(supernetId),
                network: network,
                name: name,
                purpose: purpose,
                assigned_to: assignedTo,
                gateway: gateway
            });
            showAlert('Subnet updated successfully', 'success');
        } else {
            const allocationMode = document.querySelector('input[name="allocationMode"]:checked').value;
            
            if (allocationMode === 'manual') {
                const network = document.getElementById('subnetNetwork').value;
                const gateway = document.getElementById('subnetGateway').value;
                
                if (!network) {
                    showAlert('Please fill in all required fields', 'warning');
                    return;
                }
                
                await apiCall('/api/subnets', 'POST', {
                    supernet_id: parseInt(supernetId),
                    network: network,
                    name: name,
                    purpose: purpose,
                    assigned_to: assignedTo,
                    gateway: gateway
                });
                showAlert('Subnet created successfully', 'success');
            } else {
                const data = {
                    mode: allocationMode,
                    name: name,
                    purpose: purpose,
                    assigned_to: assignedTo
                };
                
                if (allocationMode === 'by_mask') {
                    data.prefix_length = parseInt(document.getElementById('subnetPrefixLength').value);
                    if (!data.prefix_length) {
                        showAlert('Please select a subnet size', 'warning');
                        return;
                    }
                } else if (allocationMode === 'by_hosts') {
                    data.host_count = parseInt(document.getElementById('subnetHostCount').value);
                    if (!data.host_count || data.host_count < 1) {
                        showAlert('Please enter a valid host count', 'warning');
                        return;
                    }
                }
                
                const result = await apiCall(`/api/supernets/${supernetId}/allocate`, 'POST', data);
                showAlert(`Subnet allocated successfully! Network: ${result.network}`, 'success');
            }
        }
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('subnetModal'));
        modal.hide();
        
        await loadDashboard();
    } catch (error) {
        console.error('Error saving subnet:', error);
    }
}

async function editSubnet(id) {
    const subnet = subnets.find(s => s.id === id);
    if (!subnet) {
        showAlert('Subnet not found', 'error');
        return;
    }
    
    updateSubnetDropdowns();
    document.getElementById('subnetSupernet').value = subnet.supernet_id;
    document.getElementById('subnetNetwork').value = subnet.network;
    document.getElementById('subnetName').value = subnet.name;
    document.getElementById('subnetPurpose').value = subnet.purpose || '';
    document.getElementById('subnetAssignedTo').value = subnet.assigned_to || '';
    document.getElementById('subnetGateway').value = subnet.gateway || '';
    document.getElementById('subnetModal').dataset.editId = id;
    document.querySelector('#subnetModal .modal-title').textContent = 'Edit Subnet';
    document.querySelector('#subnetModal .btn-success').textContent = 'Update Subnet';
    
    const modal = new bootstrap.Modal(document.getElementById('subnetModal'));
    modal.show();
}

async function deleteSubnet(id) {
    if (!confirm('Are you sure you want to delete this subnet?')) {
        return;
    }
    
    try {
        await apiCall(`/api/subnets/${id}`, 'DELETE');
        showAlert('Subnet deleted successfully', 'success');
        await loadDashboard();
    } catch (error) {
        console.error('Error deleting subnet:', error);
    }
}

async function loadDevices() {
    try {
        devices = await apiCall('/api/devices');
        renderDevices();
    } catch (error) {
        console.error('Error loading devices:', error);
    }
}

function renderDevices() {
    const tbody = document.getElementById('devicesTable');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    devices.forEach(device => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${device.device_name}</td>
            <td><code>${device.ip_address}</code></td>
            <td>${device.hostname || ''}</td>
            <td>${device.role || ''}</td>
            <td>${device.location || ''}</td>
            <td>${device.subnet_name || ''}</td>
            <td>${new Date(device.created_at).toLocaleDateString()}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editDevice(${device.id})" title="Edit">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteDevice(${device.id})" title="Delete">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function filterDevices() {
    const searchTerm = document.getElementById('deviceSearch').value.toLowerCase();
    const subnetFilter = document.getElementById('deviceSubnetFilter').value;
    const rows = document.querySelectorAll('#devicesTable tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const matchesSearch = text.includes(searchTerm);
        const matchesFilter = !subnetFilter || row.dataset.subnetId === subnetFilter;
        row.style.display = (matchesSearch && matchesFilter) ? '' : 'none';
    });
}

function showDeviceModal() {
    const modal = new bootstrap.Modal(document.getElementById('deviceModal'));
    document.getElementById('deviceForm').reset();
    document.getElementById('deviceModal').dataset.editId = '';
    document.querySelector('#deviceModal .modal-title').textContent = 'Add Device';
    document.querySelector('#deviceModal .btn-info').textContent = 'Save Device';
    updateDeviceDropdowns();
    modal.show();
}

async function saveDeviceModal() {
    const subnetId = document.getElementById('deviceSubnet').value;
    const deviceName = document.getElementById('deviceName').value;
    const ipAddress = document.getElementById('deviceIpAddress').value;
    const hostname = document.getElementById('deviceHostname').value;
    const role = document.getElementById('deviceRole').value;
    const location = document.getElementById('deviceLocation').value;
    const editId = document.getElementById('deviceModal').dataset.editId;
    
    if (!subnetId || !deviceName || !ipAddress) {
        showAlert('Please fill in all required fields', 'warning');
        return;
    }
    
    try {
        if (editId) {
            await apiCall(`/api/devices/${editId}`, 'PUT', {
                subnet_id: parseInt(subnetId),
                device_name: deviceName,
                ip_address: ipAddress,
                hostname: hostname,
                role: role,
                location: location
            });
            showAlert('Device updated successfully', 'success');
        } else {
            await apiCall('/api/devices', 'POST', {
                subnet_id: parseInt(subnetId),
                device_name: deviceName,
                ip_address: ipAddress,
                hostname: hostname,
                role: role,
                location: location
            });
            showAlert('Device created successfully', 'success');
        }
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('deviceModal'));
        modal.hide();
        
        await loadDashboard();
    } catch (error) {
        console.error('Error saving device:', error);
    }
}

async function editDevice(id) {
    const device = devices.find(d => d.id === id);
    if (!device) {
        showAlert('Device not found', 'error');
        return;
    }
    
    updateDeviceDropdowns();
    document.getElementById('deviceSubnet').value = device.subnet_id;
    document.getElementById('deviceName').value = device.device_name;
    document.getElementById('deviceIpAddress').value = device.ip_address;
    document.getElementById('deviceHostname').value = device.hostname || '';
    document.getElementById('deviceRole').value = device.role || '';
    document.getElementById('deviceLocation').value = device.location || '';
    document.getElementById('deviceModal').dataset.editId = id;
    document.querySelector('#deviceModal .modal-title').textContent = 'Edit Device';
    document.querySelector('#deviceModal .btn-info').textContent = 'Update Device';
    
    const modal = new bootstrap.Modal(document.getElementById('deviceModal'));
    modal.show();
}

async function deleteDevice(id) {
    if (!confirm('Are you sure you want to delete this device?')) {
        return;
    }
    
    try {
        await apiCall(`/api/devices/${id}`, 'DELETE');
        showAlert('Device deleted successfully', 'success');
        await loadDashboard();
    } catch (error) {
        console.error('Error deleting device:', error);
    }
}

async function loadChangelog() {
    try {
        changelog = await apiCall('/api/changelog');
        renderChangelog();
    } catch (error) {
        console.error('Error loading changelog:', error);
    }
}

function renderChangelog() {
    const tbody = document.getElementById('changelogTable');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    changelog.forEach(entry => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${new Date(entry.timestamp).toLocaleString()}</td>
            <td><span class="badge bg-primary">${entry.action}</span></td>
            <td>${entry.object_type}</td>
            <td>${entry.details}</td>
            <td>${entry.user_name || 'System'}</td>
        `;
        tbody.appendChild(row);
    });
}

function updateSubnetDropdowns() {
    const supernetSelect = document.getElementById('subnetSupernet');
    if (supernetSelect) {
        supernetSelect.innerHTML = '<option value="">Select a supernet</option>';
        supernets.forEach(supernet => {
            const option = document.createElement('option');
            option.value = supernet.id;
            option.textContent = `${supernet.network} - ${supernet.name}`;
            supernetSelect.appendChild(option);
        });
    }
}

function updateDeviceDropdowns() {
    const subnetSelect = document.getElementById('deviceSubnet');
    if (subnetSelect) {
        subnetSelect.innerHTML = '<option value="">Select a subnet</option>';
        subnets.forEach(subnet => {
            const option = document.createElement('option');
            option.value = subnet.id;
            option.textContent = `${subnet.network} - ${subnet.name}`;
            subnetSelect.appendChild(option);
        });
    }
}

async function loadSubnetFilters() {
    const filterSelect = document.getElementById('subnetSupernetFilter');
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="">All Supernets</option>';
        supernets.forEach(supernet => {
            const option = document.createElement('option');
            option.value = supernet.id;
            option.textContent = `${supernet.network} - ${supernet.name}`;
            filterSelect.appendChild(option);
        });
    }
}

async function loadDeviceFilters() {
    const filterSelect = document.getElementById('deviceSubnetFilter');
    if (filterSelect) {
        filterSelect.innerHTML = '<option value="">All Subnets</option>';
        subnets.forEach(subnet => {
            const option = document.createElement('option');
            option.value = subnet.id;
            option.textContent = `${subnet.network} - ${subnet.name}`;
            filterSelect.appendChild(option);
        });
    }
}

async function exportData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/export`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = 'ip_tracker_export.csv';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        showAlert('Data exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting data:', error);
        showAlert('Error exporting data: ' + error.message, 'danger');
    }
}

function showImportModal() {
    const modal = new bootstrap.Modal(document.getElementById('importModal'));
    document.getElementById('importForm').reset();
    modal.show();
}

async function importData() {
    const fileInput = document.getElementById('importFile');
    const typeSelect = document.getElementById('importType');
    
    if (!fileInput.files[0] || !typeSelect.value) {
        showAlert('Please select a file and data type', 'warning');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('type', typeSelect.value);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/import`, {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        const modal = bootstrap.Modal.getInstance(document.getElementById('importModal'));
        modal.hide();
        
        showAlert(`Import successful: ${result.message}`, 'success');
        await loadDashboard();
    } catch (error) {
        console.error('Error importing data:', error);
        showAlert('Error importing data: ' + error.message, 'danger');
    }
}

function showAlert(message, type = 'info') {
    const alertContainer = document.createElement('div');
    alertContainer.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
    alertContainer.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
    alertContainer.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    document.body.appendChild(alertContainer);
    
    setTimeout(() => {
        if (alertContainer.parentNode) {
            alertContainer.parentNode.removeChild(alertContainer);
        }
    }, 5000);
}

function calculateAverageUtilization(subnets) {
    if (!subnets || subnets.length === 0) return 0;
    
    let totalUtilization = 0;
    let validSubnets = 0;
    
    subnets.forEach(subnet => {
        if (subnet.total_hosts > 0) {
            const utilization = (subnet.used_hosts || 0) / subnet.total_hosts * 100;
            totalUtilization += utilization;
            validSubnets++;
        }
    });
    
    return validSubnets > 0 ? Math.round(totalUtilization / validSubnets) : 0;
}

function toggleSubnetDetails(supernetId) {
    const row = document.querySelector(`tr[data-supernet-id="${supernetId}"]`);
    if (!row) return;
    
    const existingDetailsRow = row.nextElementSibling;
    if (existingDetailsRow && existingDetailsRow.classList.contains('subnet-details-row')) {
        existingDetailsRow.remove();
        return;
    }
    
    const subnets = JSON.parse(row.dataset.subnets || '[]');
    if (subnets.length === 0) return;
    
    const detailsRow = document.createElement('tr');
    detailsRow.classList.add('subnet-details-row');
    detailsRow.innerHTML = `
        <td colspan="9" class="bg-light">
            <div class="p-3">
                <h6 class="mb-2">Subnets in this supernet:</h6>
                <div class="row">
                    ${subnets.map(subnet => `
                        <div class="col-md-4 mb-2">
                            <div class="card card-body py-2">
                                <small>
                                    <strong><code>${subnet.network}</code></strong><br>
                                    <span class="text-muted">${subnet.name}</span>
                                </small>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </td>
    `;
    
    row.parentNode.insertBefore(detailsRow, row.nextSibling);
}
