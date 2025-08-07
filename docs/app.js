
const API_BASE_URL = 'https://ip-tracker.fly.dev';

const AUTH_CONFIG = {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyIjoiZWUtaXB0cmFja2VyIiwicGFzcyI6Im5RRTBrNTRQJSEhTlZHIiwiZXhwIjoxNzU0NDgwNzY3LCJpc3MiOiJpcC10cmFja2VyIn0.signature',
    secret: 'ip-tracker-2025-secure-key'
};

async function decryptCredentials() {
    try {
        const parts = AUTH_CONFIG.token.split('.');
        if (parts.length !== 3) {
            throw new Error('Invalid token format');
        }
        
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        
        if (payload.exp && Date.now() / 1000 > payload.exp) {
            throw new Error('Token expired');
        }
        
        if (payload.iss !== 'ip-tracker') {
            throw new Error('Invalid issuer');
        }
        
        return {
            username: payload.user,
            password: payload.pass
        };
    } catch (error) {
        console.error('Token validation failed:', error);
        return null;
    }
}

let supernets = [];
let subnets = [];
let devices = [];
let filteredSupernets = [];
let filteredSubnets = [];
let filteredDevices = [];
let currentSupernetPage = 1;
let changelog = [];

const ITEMS_PER_PAGE = 15;
let currentSubnetPage = 1;
let currentDevicePage = 1;
let currentChangelogPage = 1;

function checkAuthentication() {
    return sessionStorage.getItem('authenticated') === 'true';
}

async function login(username, password) {
    const credentials = await decryptCredentials();
    if (credentials && username === credentials.username && password === credentials.password) {
        sessionStorage.setItem('authenticated', 'true');
        showDashboard();
        return true;
    }
    return false;
}

function logout() {
    sessionStorage.removeItem('authenticated');
    showLoginForm();
}

function showLoginForm() {
    document.getElementById('loginContainer').style.display = 'block';
    document.getElementById('dashboardContainer').style.display = 'none';
}

function showDashboard() {
    document.getElementById('loginContainer').style.display = 'none';
    document.getElementById('dashboardContainer').style.display = 'block';
    setupEventListeners();
    loadDashboard();
}

function setupLoginEventListeners() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            
            if (await login(username, password)) {
                document.getElementById('loginError').style.display = 'none';
            } else {
                document.getElementById('loginError').style.display = 'block';
                document.getElementById('password').value = '';
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    if (checkAuthentication()) {
        showDashboard();
    } else {
        showLoginForm();
        setupLoginEventListeners();
    }
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
            } else if (target === '#advanced-search') {
                loadAdvancedSearch();
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
        await loadSubnets();
        await loadDevices();
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
    filteredSupernets = supernets;
    renderFilteredSupernets();
}

function renderFilteredSupernets() {
    const tbody = document.getElementById('supernetsTable');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const dataToRender = filteredSupernets.length > 0 ? filteredSupernets : supernets;
    const paginatedSupernets = paginateArray(dataToRender, currentSupernetPage);
    
    paginatedSupernets.forEach(supernet => {
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
        
        const utilizationClass = getUtilizationClass(supernet.utilization);
        row.innerHTML = `
            <td><code>${supernet.network}</code></td>
            <td>${supernet.name}</td>
            <td>${supernet.description || ''}</td>
            <td><code>${supernet.start_ip}</code></td>
            <td><code>${supernet.end_ip}</code></td>
            <td>${supernet.total_hosts.toLocaleString()}</td>
            <td>
                <div class="d-flex align-items-center">
                    <div class="utilization-bar me-2" style="width: 60px;">
                        <div class="utilization-fill ${utilizationClass}" style="width: ${supernet.utilization}%"></div>
                    </div>
                    <span class="badge bg-${utilizationClass.replace('utilization-', '')}" style="color: black !important;">${supernet.utilization}%</span>
                </div>
            </td>
            <td>${supernet.available_ips}</td>
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
    
    createPaginationControls(dataToRender.length, currentSupernetPage, 'supernetsPagination', 'goToSupernetPage');
}

function filterSupernets() {
    const searchTerm = document.getElementById('supernetSearch').value.toLowerCase();
    
    filteredSupernets = supernets.filter(supernet => {
        const matchesSearch = !searchTerm || 
            supernet.network.toLowerCase().includes(searchTerm) ||
            supernet.name.toLowerCase().includes(searchTerm) ||
            (supernet.description && supernet.description.toLowerCase().includes(searchTerm));
        
        return matchesSearch;
    });
    
    currentSupernetPage = 1;
    renderFilteredSupernets();
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
    filteredSubnets = subnets;
    renderFilteredSubnets();
}

function renderFilteredSubnets() {
    const tbody = document.getElementById('subnetsTable');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const dataToRender = filteredSubnets.length > 0 ? filteredSubnets : subnets;
    const paginatedSubnets = paginateArray(dataToRender, currentSubnetPage);
    
    paginatedSubnets.forEach(subnet => {
        const utilizationClass = getUtilizationClass(subnet.utilization);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="network-cidr">${subnet.network}</span></td>
            <td><code>${cidrToSubnetMask(subnet.network)}</code></td>
            <td>${subnet.name}</td>
            <td>${subnet.purpose || '-'}</td>
            <td><span class="ip-address">${subnet.start_ip} - ${subnet.end_ip}</span></td>
            <td><span class="ip-address">${subnet.gateway || 'Not Applicable'}</span></td>
            <td>${subnet.total_hosts}</td>
            <td>
                <div class="d-flex align-items-center">
                    <div class="utilization-bar me-2" style="width: 60px;">
                        <div class="utilization-fill ${utilizationClass}" style="width: ${subnet.utilization}%"></div>
                    </div>
                    <span class="badge bg-${utilizationClass.replace('utilization-', '')}" style="color: black !important;">${subnet.utilization}%</span>
                </div>
            </td>
            <td>${subnet.available_ips}</td>
            <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="editSubnet(${subnet.id})" title="Edit">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteSubnet(${subnet.id})" title="Delete">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        row.dataset.supernetId = subnet.supernet_id;
        tbody.appendChild(row);
    });
    
    createPaginationControls(dataToRender.length, currentSubnetPage, 'subnetsPagination', 'goToSubnetPage');
}


function filterSubnets() {
    const searchTerm = document.getElementById('subnetSearch').value.toLowerCase();
    const supernetFilter = document.getElementById('subnetSupernetFilter').value;
    
    filteredSubnets = subnets.filter(subnet => {
        const matchesSearch = !searchTerm || 
            subnet.network.toLowerCase().includes(searchTerm) ||
            subnet.name.toLowerCase().includes(searchTerm) ||
            (subnet.purpose && subnet.purpose.toLowerCase().includes(searchTerm)) ||
            (subnet.gateway && subnet.gateway.toLowerCase().includes(searchTerm));
        
        const matchesFilter = !supernetFilter || subnet.supernet_id.toString() === supernetFilter;
        
        return matchesSearch && matchesFilter;
    });
    
    currentSubnetPage = 1;
    renderFilteredSubnets();
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
        const gatewayIpField = document.getElementById('gatewayIpField');
        
        if (manualMode && manualFields) {
            manualMode.checked = true;
            manualFields.style.display = 'block';
            document.getElementById('subnetNetwork').setAttribute('required', 'required');
        }
        
        const gatewayAuto = document.getElementById('gatewayAuto');
        if (gatewayAuto && gatewayIpField) {
            gatewayAuto.checked = true;
            gatewayIpField.style.display = 'block';
            document.getElementById('subnetGateway').placeholder = 'Auto-calculated';
            document.getElementById('subnetGateway').readOnly = true;
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
    
    const gatewayRadios = document.querySelectorAll('input[name="gatewayMode"]');
    gatewayRadios.forEach(radio => {
        radio.addEventListener('change', function() {
            const gatewayIpField = document.getElementById('gatewayIpField');
            const gatewayInput = document.getElementById('subnetGateway');
            
            if (this.value === 'not_applicable') {
                gatewayIpField.style.display = 'none';
                gatewayInput.value = '';
            } else {
                gatewayIpField.style.display = 'block';
                if (this.value === 'auto') {
                    gatewayInput.placeholder = 'Auto-calculated';
                    gatewayInput.readOnly = true;
                    gatewayInput.value = '';
                } else {
                    gatewayInput.placeholder = 'e.g., 10.10.1.1';
                    gatewayInput.readOnly = false;
                }
            }
        });
    });
}

async function saveSubnetModal() {
    const supernetId = document.getElementById('subnetSupernet').value;
    const name = document.getElementById('subnetName').value;
    const purpose = document.getElementById('subnetPurpose').value;
    const gatewayMode = document.querySelector('input[name="gatewayMode"]:checked').value;
    const editId = document.getElementById('subnetModal').dataset.editId;
    
    if (!supernetId || !name) {
        showAlert('Please fill in all required fields', 'warning');
        return;
    }
    
    try {
        if (editId) {
            const network = document.getElementById('subnetNetwork').value;
            const gateway = gatewayMode === 'not_applicable' ? '' : document.getElementById('subnetGateway').value;
            
            if (!network) {
                showAlert('Please fill in all required fields', 'warning');
                return;
            }
            
            await apiCall(`/api/subnets/${editId}`, 'PUT', {
                supernet_id: parseInt(supernetId),
                network: network,
                name: name,
                purpose: purpose,
                gateway: gateway,
                gateway_mode: gatewayMode
            });
            showAlert('Subnet updated successfully', 'success');
        } else {
            const allocationMode = document.querySelector('input[name="allocationMode"]:checked').value;
            
            if (allocationMode === 'manual') {
                const network = document.getElementById('subnetNetwork').value;
                const gateway = gatewayMode === 'not_applicable' ? '' : document.getElementById('subnetGateway').value;
                
                if (!network) {
                    showAlert('Please fill in all required fields', 'warning');
                    return;
                }
                
                await apiCall('/api/subnets', 'POST', {
                    supernet_id: parseInt(supernetId),
                    network: network,
                    name: name,
                    purpose: purpose,
                        gateway: gateway,
                    gateway_mode: gatewayMode
                });
                showAlert('Subnet created successfully', 'success');
            } else {
                const data = {
                    mode: allocationMode,
                    name: name,
                    purpose: purpose,
                        gateway_mode: gatewayMode
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
    filteredDevices = devices;
    renderFilteredDevices();
}

function renderFilteredDevices() {
    const tbody = document.getElementById('devicesTable');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const dataToRender = filteredDevices.length > 0 ? filteredDevices : devices;
    const paginatedDevices = paginateArray(dataToRender, currentDevicePage);
    
    paginatedDevices.forEach(device => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${device.device_name}</td>
            <td><code>${device.ip_address}</code></td>
            <td>${device.hostname || ''}</td>
            <td>${device.role || ''}</td>
            <td>${device.location || ''}</td>
            <td>${device.port_detail || '-'}</td>
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
        row.dataset.subnetId = device.subnet_id;
        tbody.appendChild(row);
    });
    
    createPaginationControls(dataToRender.length, currentDevicePage, 'devicesPagination', 'goToDevicePage');
}


function filterDevices() {
    const searchTerm = document.getElementById('deviceSearch').value.toLowerCase();
    const subnetFilter = document.getElementById('deviceSubnetFilter').value;
    
    filteredDevices = devices.filter(device => {
        const matchesSearch = !searchTerm || 
            device.device_name.toLowerCase().includes(searchTerm) ||
            device.ip_address.toLowerCase().includes(searchTerm) ||
            (device.hostname && device.hostname.toLowerCase().includes(searchTerm)) ||
            (device.role && device.role.toLowerCase().includes(searchTerm)) ||
            (device.location && device.location.toLowerCase().includes(searchTerm)) ||
            (device.port_detail && device.port_detail.toLowerCase().includes(searchTerm)) ||
            (device.subnet_name && device.subnet_name.toLowerCase().includes(searchTerm));
        
        const matchesFilter = !subnetFilter || device.subnet_id.toString() === subnetFilter;
        
        return matchesSearch && matchesFilter;
    });
    
    currentDevicePage = 1;
    renderFilteredDevices();
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
                location: location,
                port_detail: document.getElementById('devicePortDetail').value
            });
            showAlert('Device updated successfully', 'success');
        } else {
            await apiCall('/api/devices', 'POST', {
                subnet_id: parseInt(subnetId),
                device_name: deviceName,
                ip_address: ipAddress,
                hostname: hostname,
                role: role,
                location: location,
                port_detail: document.getElementById('devicePortDetail').value
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
    document.getElementById('devicePortDetail').value = device.port_detail || '';
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
    
    const paginatedChangelog = paginateArray(changelog, currentChangelogPage);
    
    paginatedChangelog.forEach(entry => {
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
    
    createPaginationControls(changelog.length, currentChangelogPage, 'changelogPagination', 'goToChangelogPage');
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
function getUtilizationClass(utilization) {
    if (utilization >= 90) return 'utilization-high';
    if (utilization >= 70) return 'utilization-medium';
    return 'utilization-low';
}

function cidrToSubnetMask(cidr) {
    const prefixLength = parseInt(cidr.split('/')[1]);
    
    const mask = (0xFFFFFFFF << (32 - prefixLength)) >>> 0;
    
    return [
        (mask >>> 24) & 0xFF,
        (mask >>> 16) & 0xFF,
        (mask >>> 8) & 0xFF,
        mask & 0xFF
    ].join('.');
}

function createPaginationControls(totalItems, currentPage, paginationId, onPageChange) {
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    const paginationContainer = document.getElementById(paginationId);
    
    if (!paginationContainer || totalPages <= 1) {
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }
    
    let paginationHTML = '';
    
    paginationHTML += `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="${onPageChange}(${currentPage - 1}); return false;">Previous</a>
        </li>
    `;
    
    for (let i = 1; i <= totalPages; i++) {
        paginationHTML += `
            <li class="page-item ${i === currentPage ? 'active' : ''}">
                <a class="page-link" href="#" onclick="${onPageChange}(${i}); return false;">${i}</a>
            </li>
        `;
    }
    
    paginationHTML += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <a class="page-link" href="#" onclick="${onPageChange}(${currentPage + 1}); return false;">Next</a>
        </li>
    `;
    
    paginationContainer.innerHTML = paginationHTML;
}

function paginateArray(array, page) {
    const startIndex = (page - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    return array.slice(startIndex, endIndex);
}

function goToSubnetPage(page) {
    currentSubnetPage = page;
    if (filteredSubnets.length > 0) {
        renderFilteredSubnets();
    } else {
        renderSubnets();
    }
}

function goToDevicePage(page) {
    currentDevicePage = page;
    if (filteredDevices.length > 0) {
        renderFilteredDevices();
    } else {
        renderDevices();
    }
}

function goToChangelogPage(page) {
    currentChangelogPage = page;
    renderChangelog();
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

let advancedSearchResults = [];
let currentAdvancedSearchPage = 1;

function loadAdvancedSearch() {
    populateAdvancedSearchFilters();
}

function populateAdvancedSearchFilters() {
    const roleSelect = document.getElementById('advancedSearchRole');
    if (roleSelect && devices) {
        const roles = [...new Set(devices.map(d => d.role).filter(r => r))];
        roleSelect.innerHTML = '<option value="">All Roles</option>';
        roles.forEach(role => {
            const option = document.createElement('option');
            option.value = role;
            option.textContent = role;
            roleSelect.appendChild(option);
        });
    }
    
    const locationSelect = document.getElementById('advancedSearchLocation');
    if (locationSelect && devices) {
        const locations = [...new Set(devices.map(d => d.location).filter(l => l))];
        locationSelect.innerHTML = '<option value="">All Locations</option>';
        locations.forEach(location => {
            const option = document.createElement('option');
            option.value = location;
            option.textContent = location;
            locationSelect.appendChild(option);
        });
    }
    
    const purposeSelect = document.getElementById('advancedSearchPurpose');
    if (purposeSelect && subnets) {
        const purposes = [...new Set(subnets.map(s => s.purpose).filter(p => p))];
        purposeSelect.innerHTML = '<option value="">All Purposes</option>';
        purposes.forEach(purpose => {
            const option = document.createElement('option');
            option.value = purpose;
            option.textContent = purpose;
            purposeSelect.appendChild(option);
        });
    }
}

function performAdvancedSearch() {
    const searchTerm = document.getElementById('advancedSearchTerm').value.toLowerCase().trim();
    const operator = document.getElementById('advancedSearchOperator').value;
    const entityType = document.getElementById('advancedSearchEntityType').value;
    const roleFilter = document.getElementById('advancedSearchRole').value;
    const locationFilter = document.getElementById('advancedSearchLocation').value;
    const purposeFilter = document.getElementById('advancedSearchPurpose').value;
    
    if (!searchTerm && !roleFilter && !locationFilter && !purposeFilter) {
        showAlert('Please enter search criteria', 'warning');
        return;
    }
    
    advancedSearchResults = [];
    
    const matchesSearch = (text, searchTerm, operator) => {
        if (!searchTerm) return true;
        if (!text) return false;
        text = text.toLowerCase();
        switch (operator) {
            case 'equals': return text === searchTerm;
            case 'starts_with': return text.startsWith(searchTerm);
            case 'contains':
            default: return text.includes(searchTerm);
        }
    };
    
    if (!entityType || entityType === 'supernets') {
        supernets.forEach(supernet => {
            const matches = matchesSearch(supernet.network, searchTerm, operator) ||
                           matchesSearch(supernet.name, searchTerm, operator) ||
                           matchesSearch(supernet.description, searchTerm, operator);
            
            if (matches) {
                advancedSearchResults.push({
                    type: 'supernet',
                    data: supernet,
                    displayText: `${supernet.network} - ${supernet.name}`
                });
            }
        });
    }
    
    if (!entityType || entityType === 'subnets') {
        subnets.forEach(subnet => {
            const matches = (matchesSearch(subnet.network, searchTerm, operator) ||
                            matchesSearch(subnet.name, searchTerm, operator) ||
                            matchesSearch(subnet.purpose, searchTerm, operator) ||
                            matchesSearch(subnet.gateway, searchTerm, operator)) &&
                           (!purposeFilter || subnet.purpose === purposeFilter);
            
            if (matches) {
                advancedSearchResults.push({
                    type: 'subnet',
                    data: subnet,
                    displayText: `${subnet.network} - ${subnet.name}`
                });
            }
        });
    }
    
    if (!entityType || entityType === 'devices') {
        devices.forEach(device => {
            const matches = (matchesSearch(device.device_name, searchTerm, operator) ||
                            matchesSearch(device.ip_address, searchTerm, operator) ||
                            matchesSearch(device.hostname, searchTerm, operator) ||
                            matchesSearch(device.role, searchTerm, operator) ||
                            matchesSearch(device.location, searchTerm, operator) ||
                            matchesSearch(device.port_detail, searchTerm, operator)) &&
                           (!roleFilter || device.role === roleFilter) &&
                           (!locationFilter || device.location === locationFilter);
            
            if (matches) {
                advancedSearchResults.push({
                    type: 'device',
                    data: device,
                    displayText: `${device.device_name} (${device.ip_address})`
                });
            }
        });
    }
    
    currentAdvancedSearchPage = 1;
    renderAdvancedSearchResults();
}

function renderAdvancedSearchResults() {
    const resultsContainer = document.getElementById('advancedSearchResults');
    if (!resultsContainer) return;
    
    if (advancedSearchResults.length === 0) {
        resultsContainer.innerHTML = `
            <div class="text-muted text-center py-4">
                <i class="bi bi-search fs-1"></i>
                <p class="mt-2">No results found matching your search criteria.</p>
            </div>
        `;
        return;
    }
    
    const groupedResults = {
        supernet: advancedSearchResults.filter(r => r.type === 'supernet'),
        subnet: advancedSearchResults.filter(r => r.type === 'subnet'),
        device: advancedSearchResults.filter(r => r.type === 'device')
    };
    
    let html = `<div class="mb-3"><strong>Found ${advancedSearchResults.length} results</strong></div>`;
    
    if (groupedResults.supernet.length > 0) {
        html += `
            <div class="mb-4">
                <h6 class="text-primary"><i class="bi bi-globe"></i> Supernets (${groupedResults.supernet.length})</h6>
                <div class="table-responsive">
                    <table class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th>Network</th>
                                <th>Name</th>
                                <th>Description</th>
                                <th>Total Hosts</th>
                                <th>Utilization</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        groupedResults.supernet.forEach(result => {
            const supernet = result.data;
            html += `
                <tr>
                    <td><code>${supernet.network}</code></td>
                    <td>${supernet.name}</td>
                    <td>${supernet.description || '-'}</td>
                    <td>${supernet.total_hosts || 0}</td>
                    <td><span class="badge bg-info">${supernet.utilization || 0}%</span></td>
                </tr>
            `;
        });
        html += '</tbody></table></div></div>';
    }
    
    if (groupedResults.subnet.length > 0) {
        html += `
            <div class="mb-4">
                <h6 class="text-success"><i class="bi bi-diagram-3"></i> Subnets (${groupedResults.subnet.length})</h6>
                <div class="table-responsive">
                    <table class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th>Network</th>
                                <th>Name</th>
                                <th>Purpose</th>
                                <th>Valid Range</th>
                                <th>Gateway</th>
                                <th>Utilization</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        groupedResults.subnet.forEach(result => {
            const subnet = result.data;
            const utilizationClass = getUtilizationClass(subnet.utilization);
            html += `
                <tr>
                    <td><code>${subnet.network}</code></td>
                    <td>${subnet.name}</td>
                    <td>${subnet.purpose || '-'}</td>
                    <td><span class="ip-address">${subnet.start_ip} - ${subnet.end_ip}</span></td>
                    <td><span class="ip-address">${subnet.gateway || '-'}</span></td>
                    <td><span class="badge ${utilizationClass}">${subnet.utilization || 0}%</span></td>
                </tr>
            `;
        });
        html += '</tbody></table></div></div>';
    }
    
    if (groupedResults.device.length > 0) {
        html += `
            <div class="mb-4">
                <h6 class="text-warning"><i class="bi bi-device-hdd"></i> Devices (${groupedResults.device.length})</h6>
                <div class="table-responsive">
                    <table class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th>Device Name</th>
                                <th>IP Address</th>
                                <th>Hostname</th>
                                <th>Role</th>
                                <th>Location</th>
                                <th>Port Detail</th>
                            </tr>
                        </thead>
                        <tbody>
        `;
        groupedResults.device.forEach(result => {
            const device = result.data;
            html += `
                <tr>
                    <td>${device.device_name}</td>
                    <td><span class="ip-address">${device.ip_address}</span></td>
                    <td>${device.hostname || '-'}</td>
                    <td>${device.role || '-'}</td>
                    <td>${device.location || '-'}</td>
                    <td>${device.port_detail || '-'}</td>
                </tr>
            `;
        });
        html += '</tbody></table></div></div>';
    }
    
    resultsContainer.innerHTML = html;
}

function clearAdvancedSearch() {
    document.getElementById('advancedSearchTerm').value = '';
    document.getElementById('advancedSearchOperator').value = 'contains';
    document.getElementById('advancedSearchEntityType').value = '';
    document.getElementById('advancedSearchRole').value = '';
    document.getElementById('advancedSearchLocation').value = '';
    document.getElementById('advancedSearchPurpose').value = '';
    
    const resultsContainer = document.getElementById('advancedSearchResults');
    if (resultsContainer) {
        resultsContainer.innerHTML = `
            <div class="text-muted text-center py-4">
                <i class="bi bi-search fs-1"></i>
                <p class="mt-2">Enter search criteria and click Search to find results across all data.</p>
            </div>
        `;
    }
    
    advancedSearchResults = [];
}

function goToSupernetPage(page) {
    currentSupernetPage = page;
    if (filteredSupernets.length > 0) {
        renderFilteredSupernets();
    } else {
        renderSupernets();
    }
}
