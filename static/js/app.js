const API_BASE_URL = 'https://ip-tracker.fly.dev';

let supernets = [];
let subnets = [];
let devices = [];
let filteredSupernets = [];
let filteredSubnets = [];
let filteredDevices = [];
let currentSupernetPage = 1;
let currentSubnetPage = 1;
let currentDevicePage = 1;
let dashboardStats = {};

document.addEventListener('DOMContentLoaded', function() {
    loadDashboard();
    setupEventListeners();
});

function setupEventListeners() {
    const supernetSearch = document.getElementById('supernetSearch');
    if (supernetSearch) {
        supernetSearch.addEventListener('input', filterSupernets);
    }
    
    const subnetSearch = document.getElementById('subnetSearch');
    if (subnetSearch) {
        subnetSearch.addEventListener('input', filterSubnets);
    }
    
    const deviceSearch = document.getElementById('deviceSearch');
    if (deviceSearch) {
        deviceSearch.addEventListener('input', filterDevices);
    }
    
    const subnetSupernetFilter = document.getElementById('subnetSupernetFilter');
    if (subnetSupernetFilter) {
        subnetSupernetFilter.addEventListener('change', filterSubnets);
    }
    
    const deviceSubnetFilter = document.getElementById('deviceSubnetFilter');
    if (deviceSubnetFilter) {
        deviceSubnetFilter.addEventListener('change', filterDevices);
    }
    
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

async function loadDashboard() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/dashboard`);
        dashboardStats = await response.json();
        
        document.getElementById('supernetCount').textContent = dashboardStats.supernet_count;
        document.getElementById('subnetCount').textContent = dashboardStats.subnet_count;
        document.getElementById('deviceCount').textContent = dashboardStats.device_count;
        
        updateNetworkHealth(dashboardStats);
        
        await loadSupernets();
        await loadSubnets();
        
        calculateAvgUtilization();
    } catch (error) {
        showAlert('Error loading dashboard: ' + error.message, 'danger');
    }
}

function updateNetworkHealth(stats) {
    const healthCard = document.getElementById('networkHealthCard');
    const healthElement = document.getElementById('networkHealth');
    const healthIcon = document.getElementById('healthIcon');
    const criticalCount = document.getElementById('criticalCount');
    const warningCount = document.getElementById('warningCount');
    
    if (healthElement) {
        healthElement.textContent = stats.network_health.charAt(0).toUpperCase() + stats.network_health.slice(1);
    }
    
    if (healthCard) {
        healthCard.className = 'card';
        if (stats.network_health === 'critical') {
            healthCard.classList.add('bg-danger', 'text-white');
            if (healthIcon) healthIcon.className = 'bi bi-shield-x fs-1';
        } else if (stats.network_health === 'warning') {
            healthCard.classList.add('bg-warning', 'text-dark');
            if (healthIcon) healthIcon.className = 'bi bi-shield-exclamation fs-1';
        } else {
            healthCard.classList.add('bg-success', 'text-white');
            if (healthIcon) healthIcon.className = 'bi bi-shield-check fs-1';
        }
    }
    
    if (criticalCount) {
        criticalCount.textContent = stats.critical_subnets ? stats.critical_subnets.length : 0;
    }
    
    if (warningCount) {
        warningCount.textContent = stats.warning_subnets ? stats.warning_subnets.length : 0;
    }
}

function calculateAvgUtilization() {
    if (subnets.length === 0) {
        document.getElementById('avgUtilization').textContent = '0%';
        return;
    }
    
    const totalUtilization = subnets.reduce((sum, subnet) => sum + (subnet.utilization || 0), 0);
    const avgUtilization = Math.round(totalUtilization / subnets.length);
    const avgElement = document.getElementById('avgUtilization');
    if (avgElement) {
        avgElement.textContent = avgUtilization + '%';
    }
}

async function loadSupernets() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/supernets`);
        supernets = await response.json();
        renderSupernets();
        populateSupernetDropdowns();
    } catch (error) {
        showAlert('Error loading supernets: ' + error.message, 'danger');
    }
}

async function loadSubnets() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/subnets`);
        subnets = await response.json();
        renderSubnets();
        populateSubnetDropdowns();
        calculateAvgUtilization();
    } catch (error) {
        showAlert('Error loading subnets: ' + error.message, 'danger');
    }
}

async function loadDevices() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/devices`);
        devices = await response.json();
        renderDevices();
    } catch (error) {
        showAlert('Error loading devices: ' + error.message, 'danger');
    }
}

async function loadChangelog() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/dashboard`);
        const data = await response.json();
        renderChangelog(data.recent_changes);
    } catch (error) {
        showAlert('Error loading changelog: ' + error.message, 'danger');
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
        const utilizationClass = getUtilizationClass(supernet.utilization || 0);
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
            <td><span class="network-cidr">${supernet.network}</span></td>
            <td>${supernet.name || '-'}</td>
            <td>${supernet.description || '-'}</td>
            <td><span class="ip-address">${supernet.start_ip}</span></td>
            <td><span class="ip-address">${supernet.end_ip}</span></td>
            <td>${supernet.total_hosts.toLocaleString()}</td>
            <td>${subnetDisplay}</td>
            <td>
                <div class="d-flex align-items-center">
                    <div class="utilization-bar me-2" style="width: 60px;">
                        <div class="utilization-fill ${utilizationClass}" style="width: ${supernet.utilization || 0}%"></div>
                    </div>
                    <span class="badge bg-${utilizationClass.replace('utilization-', '')}" style="color: black !important;">${supernet.utilization || 0}%</span>
                </div>
            </td>
            <td>${supernet.available_ips || 0}</td>
            <td>${formatDate(supernet.created_at)}</td>
            <td>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteSupernet(${supernet.id})">
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

function renderSubnets() {
    filteredSubnets = subnets;
    renderFilteredSubnets();
}

function renderFilteredSubnets() {
    const tbody = document.getElementById('subnetsTable');
    tbody.innerHTML = '';
    
    const dataToRender = filteredSubnets.length > 0 ? filteredSubnets : subnets;
    
    dataToRender.forEach(subnet => {
        const utilizationClass = getUtilizationClass(subnet.utilization);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="network-cidr">${subnet.network}</span></td>
            <td>${subnet.name}</td>
            <td>${subnet.purpose || '-'}</td>
            <td><span class="ip-address">${subnet.start_ip} - ${subnet.end_ip}</span></td>
            <td><span class="ip-address">${subnet.gateway || '-'}</span></td>
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
                <button class="btn btn-sm btn-outline-danger" onclick="deleteSubnet(${subnet.id})">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderDevices() {
    filteredDevices = devices;
    renderFilteredDevices();
}

function renderFilteredDevices() {
    const tbody = document.getElementById('devicesTable');
    tbody.innerHTML = '';
    
    const dataToRender = filteredDevices.length > 0 ? filteredDevices : devices;
    
    dataToRender.forEach(device => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${device.device_name}</td>
            <td><span class="ip-address">${device.ip_address}</span></td>
            <td>${device.hostname || '-'}</td>
            <td>${device.role || '-'}</td>
            <td>${device.location || '-'}</td>
            <td>${device.port_detail || '-'}</td>
            <td><span class="network-cidr">${device.subnet_network}</span></td>
            <td>${formatDate(device.created_at)}</td>
            <td>
                <button class="btn btn-sm btn-outline-danger" onclick="deleteDevice(${device.id})">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderChangelog(changes) {
    const tbody = document.getElementById('changelogTable');
    tbody.innerHTML = '';
    
    changes.forEach(change => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${formatDate(change.timestamp)}</td>
            <td><span class="badge bg-primary">${change.action}</span></td>
            <td>${change.object_type}</td>
            <td>${change.details}</td>
            <td>${change.user_name}</td>
        `;
        tbody.appendChild(row);
    });
}

function populateSupernetDropdowns() {
    const selects = ['subnetSupernet', 'subnetSupernetFilter'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return; // Skip if element doesn't exist
        
        const currentValue = select.value;
        
        select.innerHTML = selectId.includes('Filter') ? 
            '<option value="">All Supernets</option>' : 
            '<option value="">Select a supernet</option>';
        
        supernets.forEach(supernet => {
            const option = document.createElement('option');
            option.value = supernet.id;
            option.textContent = `${supernet.network} - ${supernet.name || 'Unnamed'}`;
            select.appendChild(option);
        });
        
        if (currentValue) select.value = currentValue;
    });
}

function populateSubnetDropdowns() {
    const selects = ['deviceSubnet', 'deviceSubnetFilter'];
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        const currentValue = select.value;
        
        select.innerHTML = selectId.includes('Filter') ? 
            '<option value="">All Subnets</option>' : 
            '<option value="">Select a subnet</option>';
        
        subnets.forEach(subnet => {
            const option = document.createElement('option');
            option.value = subnet.id;
            option.textContent = `${subnet.network} - ${subnet.name}`;
            select.appendChild(option);
        });
        
        if (currentValue) select.value = currentValue;
    });
}

function showSupernetModal() {
    document.getElementById('supernetForm').reset();
    new bootstrap.Modal(document.getElementById('supernetModal')).show();
}

function showSubnetModal() {
    document.getElementById('subnetForm').reset();
    populateSupernetDropdowns();
    
    const modal = new bootstrap.Modal(document.getElementById('subnetModal'));
    modal.show();
    
    setTimeout(() => {
        setupSubnetModeListeners();
        const manualMode = document.getElementById('manualMode');
        const manualFields = document.getElementById('manualFields');
        const gatewayAuto = document.getElementById('gatewayAuto');
        const manualGatewayFields = document.getElementById('manualGatewayFields');
        
        if (manualMode && manualFields) {
            manualMode.checked = true;
            manualFields.style.display = 'block';
            document.getElementById('subnetNetwork').setAttribute('required', 'required');
        }
        
        if (gatewayAuto && manualGatewayFields) {
            gatewayAuto.checked = true;
            manualGatewayFields.style.display = 'none';
        }
    }, 100);
}

function setupSubnetModeListeners() {
    const modeRadios = document.querySelectorAll('input[name="allocationMode"]');
    const gatewayRadios = document.querySelectorAll('input[name="gatewayMode"]');
    const manualFields = document.getElementById('manualFields');
    const byMaskFields = document.getElementById('byMaskFields');
    const byHostsFields = document.getElementById('byHostsFields');
    const manualGatewayFields = document.getElementById('manualGatewayFields');
    
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
    
    if (gatewayRadios.length > 0 && manualGatewayFields) {
        gatewayRadios.forEach(radio => {
            radio.addEventListener('change', function() {
                if (this.value === 'manual') {
                    manualGatewayFields.style.display = 'block';
                    document.getElementById('subnetGateway').setAttribute('required', 'required');
                } else {
                    manualGatewayFields.style.display = 'none';
                    document.getElementById('subnetGateway').removeAttribute('required');
                }
            });
        });
    }
}

function showDeviceModal() {
    document.getElementById('deviceForm').reset();
    populateSubnetDropdowns();
    new bootstrap.Modal(document.getElementById('deviceModal')).show();
}

function showImportModal() {
    document.getElementById('importForm').reset();
    new bootstrap.Modal(document.getElementById('importModal')).show();
}

async function saveSupernet() {
    const form = document.getElementById('supernetForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const data = {
        network: document.getElementById('supernetNetwork').value,
        name: document.getElementById('supernetName').value,
        description: document.getElementById('supernetDescription').value
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/supernets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert('Supernet created successfully!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('supernetModal')).hide();
            loadDashboard();
        } else {
            showAlert('Error: ' + result.error, 'danger');
        }
    } catch (error) {
        showAlert('Error creating supernet: ' + error.message, 'danger');
    }
}

async function saveSubnet() {
    const form = document.getElementById('subnetForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const allocationMode = document.querySelector('input[name="allocationMode"]:checked').value;
    const supernetId = parseInt(document.getElementById('subnetSupernet').value);
    const name = document.getElementById('subnetName').value;
    const purpose = document.getElementById('subnetPurpose').value;
    
    if (allocationMode === 'manual') {
        const gatewayMode = document.querySelector('input[name="gatewayMode"]:checked').value;
        let gateway = '';
        
        if (gatewayMode === 'manual') {
            gateway = document.getElementById('subnetGateway').value;
        } else if (gatewayMode === 'not_applicable') {
            gateway = '';
        }
        
        const data = {
            supernet_id: supernetId,
            network: document.getElementById('subnetNetwork').value,
            name: name,
            purpose: purpose,
            gateway: gateway,
            gateway_mode: gatewayMode
        };
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/subnets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                showAlert('Subnet created successfully!', 'success');
                bootstrap.Modal.getInstance(document.getElementById('subnetModal')).hide();
                loadDashboard();
            } else {
                showAlert('Error: ' + result.error, 'danger');
            }
        } catch (error) {
            showAlert('Error creating subnet: ' + error.message, 'danger');
        }
    } else {
        const gatewayMode = document.querySelector('input[name="gatewayMode"]:checked').value;
        
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
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/supernets/${supernetId}/allocate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                showAlert(`Subnet allocated successfully! Network: ${result.network}`, 'success');
                bootstrap.Modal.getInstance(document.getElementById('subnetModal')).hide();
                loadDashboard();
            } else {
                showAlert('Error: ' + result.error, 'danger');
            }
        } catch (error) {
            showAlert('Error allocating subnet: ' + error.message, 'danger');
        }
    }
}

async function saveDevice() {
    const form = document.getElementById('deviceForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const data = {
        subnet_id: parseInt(document.getElementById('deviceSubnet').value),
        device_name: document.getElementById('deviceName').value,
        ip_address: document.getElementById('deviceIP').value,
        hostname: document.getElementById('deviceHostname').value,
        role: document.getElementById('deviceRole').value,
        location: document.getElementById('deviceLocation').value,
        port_detail: document.getElementById('devicePortDetail').value
    };
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/devices`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert('Device created successfully!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('deviceModal')).hide();
            loadDashboard();
        } else {
            showAlert('Error: ' + result.error, 'danger');
        }
    } catch (error) {
        showAlert('Error creating device: ' + error.message, 'danger');
    }
}

async function deleteSupernet(id) {
    if (!confirm('Are you sure you want to delete this supernet? This will also delete all associated subnets and devices.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/supernets/${id}`, { method: 'DELETE' });
        const result = await response.json();
        
        if (response.ok) {
            showAlert('Supernet deleted successfully!', 'success');
            loadDashboard();
        } else {
            showAlert('Error: ' + result.error, 'danger');
        }
    } catch (error) {
        showAlert('Error deleting supernet: ' + error.message, 'danger');
    }
}

async function deleteSubnet(id) {
    if (!confirm('Are you sure you want to delete this subnet? This will also delete all associated devices.')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/subnets/${id}`, { method: 'DELETE' });
        const result = await response.json();
        
        if (response.ok) {
            showAlert('Subnet deleted successfully!', 'success');
            loadDashboard();
        } else {
            showAlert('Error: ' + result.error, 'danger');
        }
    } catch (error) {
        showAlert('Error deleting subnet: ' + error.message, 'danger');
    }
}

async function deleteDevice(id) {
    if (!confirm('Are you sure you want to delete this device?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/devices/${id}`, { method: 'DELETE' });
        const result = await response.json();
        
        if (response.ok) {
            showAlert('Device deleted successfully!', 'success');
            loadDashboard();
        } else {
            showAlert('Error: ' + result.error, 'danger');
        }
    } catch (error) {
        showAlert('Error deleting device: ' + error.message, 'danger');
    }
}

async function exportData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/export`);
        const blob = await response.blob();
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ip-tracker-export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showAlert('Data exported successfully!', 'success');
    } catch (error) {
        showAlert('Error exporting data: ' + error.message, 'danger');
    }
}

async function importData() {
    const form = document.getElementById('importForm');
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const fileInput = document.getElementById('importFile');
    const dataType = document.getElementById('importType').value;
    
    if (!fileInput.files[0]) {
        showAlert('Please select a file to import', 'warning');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('type', dataType);
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/import`, {
            method: 'POST',
            body: formData
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showAlert(`Import completed! ${result.imported} records imported.`, 'success');
            bootstrap.Modal.getInstance(document.getElementById('importModal')).hide();
            loadDashboard();
        } else {
            showAlert('Error: ' + result.error, 'danger');
        }
    } catch (error) {
        showAlert('Error importing data: ' + error.message, 'danger');
    }
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

function getUtilizationClass(utilization) {
    if (utilization < 50) return 'utilization-low';
    if (utilization < 80) return 'utilization-medium';
    return 'utilization-high';
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function showAlert(message, type = 'info') {
    const alertContainer = document.getElementById('alertContainer');
    const alertId = 'alert-' + Date.now();
    
    const alertHtml = `
        <div class="alert alert-${type} alert-dismissible fade show" id="${alertId}" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    alertContainer.insertAdjacentHTML('beforeend', alertHtml);
    
    setTimeout(() => {
        const alertElement = document.getElementById(alertId);
        if (alertElement) {
            const alert = bootstrap.Alert.getOrCreateInstance(alertElement);
            alert.close();
        }
    }, 5000);
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
        <td colspan="10" class="bg-light">
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

function paginateArray(array, page, itemsPerPage = 15) {
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return array.slice(startIndex, endIndex);
}

function createPaginationControls(totalItems, currentPage, containerId, functionName, itemsPerPage = 15) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }
    
    let html = '<nav><ul class="pagination pagination-sm justify-content-center">';
    
    if (currentPage > 1) {
        html += `<li class="page-item"><a class="page-link" href="#" onclick="${functionName}(${currentPage - 1}); return false;">Previous</a></li>`;
    }
    
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            html += `<li class="page-item active"><span class="page-link">${i}</span></li>`;
        } else {
            html += `<li class="page-item"><a class="page-link" href="#" onclick="${functionName}(${i}); return false;">${i}</a></li>`;
        }
    }
    
    if (currentPage < totalPages) {
        html += `<li class="page-item"><a class="page-link" href="#" onclick="${functionName}(${currentPage + 1}); return false;">Next</a></li>`;
    }
    
    html += '</ul></nav>';
    container.innerHTML = html;
}
