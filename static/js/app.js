let supernets = [];
let subnets = [];
let devices = [];
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
            }
        });
    }
}

async function loadDashboard() {
    try {
        const response = await fetch('/api/dashboard');
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
        const response = await fetch('/api/supernets');
        supernets = await response.json();
        renderSupernets();
        populateSupernetDropdowns();
    } catch (error) {
        showAlert('Error loading supernets: ' + error.message, 'danger');
    }
}

async function loadSubnets() {
    try {
        const response = await fetch('/api/subnets');
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
        const response = await fetch('/api/devices');
        devices = await response.json();
        renderDevices();
    } catch (error) {
        showAlert('Error loading devices: ' + error.message, 'danger');
    }
}

async function loadChangelog() {
    try {
        const response = await fetch('/api/dashboard');
        const data = await response.json();
        renderChangelog(data.recent_changes);
    } catch (error) {
        showAlert('Error loading changelog: ' + error.message, 'danger');
    }
}

function renderSupernets() {
    const tbody = document.getElementById('supernetsTable');
    tbody.innerHTML = '';
    
    supernets.forEach(supernet => {
        const utilizationClass = getUtilizationClass(supernet.utilization || 0);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="network-cidr">${supernet.network}</span></td>
            <td>${supernet.name || '-'}</td>
            <td>${supernet.description || '-'}</td>
            <td><span class="ip-address">${supernet.start_ip}</span></td>
            <td><span class="ip-address">${supernet.end_ip}</span></td>
            <td>${supernet.total_hosts.toLocaleString()}</td>
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
        tbody.appendChild(row);
    });
}

function renderSubnets() {
    const tbody = document.getElementById('subnetsTable');
    tbody.innerHTML = '';
    
    subnets.forEach(subnet => {
        const utilizationClass = getUtilizationClass(subnet.utilization);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><span class="network-cidr">${subnet.network}</span></td>
            <td>${subnet.name}</td>
            <td>${subnet.purpose || '-'}</td>
            <td>${subnet.assigned_to || '-'}</td>
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
    const tbody = document.getElementById('devicesTable');
    tbody.innerHTML = '';
    
    devices.forEach(device => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${device.device_name}</td>
            <td><span class="ip-address">${device.ip_address}</span></td>
            <td>${device.hostname || '-'}</td>
            <td>${device.role || '-'}</td>
            <td>${device.location || '-'}</td>
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
        if (manualMode && manualFields) {
            manualMode.checked = true;
            manualFields.style.display = 'block';
            document.getElementById('subnetNetwork').setAttribute('required', 'required');
        }
    }, 100);
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
        const response = await fetch('/api/supernets', {
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
    const assignedTo = document.getElementById('subnetAssignedTo').value;
    
    if (allocationMode === 'manual') {
        const data = {
            supernet_id: supernetId,
            network: document.getElementById('subnetNetwork').value,
            name: name,
            purpose: purpose,
            assigned_to: assignedTo,
            gateway: document.getElementById('subnetGateway').value
        };
        
        try {
            const response = await fetch('/api/subnets', {
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
        
        try {
            const response = await fetch(`/api/supernets/${supernetId}/allocate`, {
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
        location: document.getElementById('deviceLocation').value
    };
    
    try {
        const response = await fetch('/api/devices', {
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
        const response = await fetch(`/api/supernets/${id}`, { method: 'DELETE' });
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
        const response = await fetch(`/api/subnets/${id}`, { method: 'DELETE' });
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
        const response = await fetch(`/api/devices/${id}`, { method: 'DELETE' });
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
        const response = await fetch('/api/export');
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
        const response = await fetch('/api/import', {
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
    const rows = document.querySelectorAll('#supernetsTable tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(searchTerm) ? '' : 'none';
    });
}

function filterSubnets() {
    const searchTerm = document.getElementById('subnetSearch').value.toLowerCase();
    const supernetFilter = document.getElementById('subnetSupernetFilter').value;
    const rows = document.querySelectorAll('#subnetsTable tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const matchesSearch = text.includes(searchTerm);
        
        let matchesFilter = true;
        if (supernetFilter) {
            const subnet = subnets.find(s => s.network === row.querySelector('.network-cidr').textContent);
            matchesFilter = subnet && subnet.supernet_id == supernetFilter;
        }
        
        row.style.display = (matchesSearch && matchesFilter) ? '' : 'none';
    });
}

function filterDevices() {
    const searchTerm = document.getElementById('deviceSearch').value.toLowerCase();
    const subnetFilter = document.getElementById('deviceSubnetFilter').value;
    const rows = document.querySelectorAll('#devicesTable tr');
    
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        const matchesSearch = text.includes(searchTerm);
        
        let matchesFilter = true;
        if (subnetFilter) {
            const device = devices.find(d => d.ip_address === row.querySelector('.ip-address').textContent);
            matchesFilter = device && device.subnet_id == subnetFilter;
        }
        
        row.style.display = (matchesSearch && matchesFilter) ? '' : 'none';
    });
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
