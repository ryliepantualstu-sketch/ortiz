// QR verification module for staff dashboard

function setVerificationResult(type, message) {
    const resultEl = document.getElementById('verificationResult');
    if (!resultEl) return;

    resultEl.className = `alert mt-3 mb-0 alert-${type}`;
    resultEl.textContent = message || '';
    resultEl.classList.remove('d-none');
}

function hideVerificationDetails() {
    const panel = document.getElementById('verificationDetails');
    const body = document.getElementById('verificationDetailsBody');
    if (panel) panel.classList.add('d-none');
    if (body) body.innerHTML = '&nbsp;';
}

function showVerificationDetails(appointment) {
    try {
        const body = document.getElementById('verificationDetailsBody');
        const panel = document.getElementById('verificationDetails');
        if (!body || !panel) return;

        const customer = appointment.Customer || {};
        const user = (customer.User) ? customer.User : (appointment.Customer?.User || {});

        const html = `
            <p><strong>Appointment ID:</strong> ${appointment.appointment_id}</p>
            <p><strong>Service:</strong> ${appointment.service_type || 'N/A'}</p>
            <p><strong>Date / Time:</strong> ${formatAppointmentDate(appointment.appointment_date)} ${formatAppointmentTime(appointment.appointment_time)}</p>
            <p><strong>Status:</strong> ${appointment.status || 'N/A'}</p>
            <hr>
            <p><strong>Customer:</strong> ${user.full_name || customer.full_name || 'N/A'}</p>
            <p><strong>Email:</strong> ${user.email || 'N/A'}</p>
            <p><strong>Phone:</strong> ${user.phone || 'N/A'}</p>
            <p><strong>Customer ID:</strong> ${customer.customer_id || 'N/A'}</p>
        `;

        body.innerHTML = html;
        panel.classList.remove('d-none');
    } catch (e) {
        console.error('Show verification details error:', e);
    }
}

async function verifyAppointmentQr() {
    const input = document.getElementById('qrCodeInput');
    const button = document.getElementById('verifyQrButton');
    const qrCodeData = input?.value.trim();

    if (!qrCodeData) {
        setVerificationResult('warning', 'Enter the scanned appointment QR payload first.');
        return;
    }

    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Confirming';
    }

    try {
        const result = await apiCall('/staff/appointments/verify', 'POST', {
            qr_code_data: qrCodeData
        });

        if (result && result.success && result.appointment) {
            setVerificationResult('success', 'Appointment confirmed successfully');
            showVerificationDetails(result.appointment);
            if (input) input.value = '';
            await loadDashboard();
            await loadAllAppointments();
        } else {
            setVerificationResult('danger', result.message || 'Appointment confirmation failed.');
            hideVerificationDetails();
        }
    } catch (error) {
        console.error('Verification error:', error);
        setVerificationResult('danger', 'Appointment confirmation failed.');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-qrcode"></i> Confirm Appointment';
        }
    }
}
