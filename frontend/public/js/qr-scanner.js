// QR verification module for staff dashboard

let qrCameraStream = null;
let qrScanFrame = null;
let pendingQrAppointment = null;

function setQrCameraMessage(message, type = 'muted') {
    const messageEl = document.getElementById('qrCameraMessage');
    if (!messageEl) return;
    messageEl.textContent = message;
    messageEl.className = `qr-camera-message text-${type}`;
}

function stopQrScanner() {
    if (qrScanFrame) {
        cancelAnimationFrame(qrScanFrame);
        qrScanFrame = null;
    }

    if (qrCameraStream) {
        qrCameraStream.getTracks().forEach((track) => track.stop());
        qrCameraStream = null;
    }

    const video = document.getElementById('qrVideo');
    const startButton = document.getElementById('startQrScannerButton');
    const stopButton = document.getElementById('stopQrScannerButton');
    if (video) video.srcObject = null;
    if (startButton) startButton.classList.remove('d-none');
    if (stopButton) stopButton.classList.add('d-none');
    setQrCameraMessage('Camera is off.');
}

async function startQrScanner() {
    const video = document.getElementById('qrVideo');
    const canvas = document.getElementById('qrCanvas');
    const startButton = document.getElementById('startQrScannerButton');
    const stopButton = document.getElementById('stopQrScannerButton');

    if (!video || !canvas) return;
    if (!navigator.mediaDevices?.getUserMedia) {
        setQrCameraMessage('Camera access is not supported by this browser.', 'danger');
        return;
    }
    if (typeof jsQR !== 'function') {
        setQrCameraMessage('QR scanner library could not be loaded. Paste the QR payload instead.', 'danger');
        return;
    }

    stopQrScanner();
    try {
        qrCameraStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
        });
        video.srcObject = qrCameraStream;
        await video.play();
        if (startButton) startButton.classList.add('d-none');
        if (stopButton) stopButton.classList.remove('d-none');
        setQrCameraMessage('Point the camera at the appointment QR code.');
        scanQrFrame(video, canvas);
    } catch (error) {
        console.error('QR camera error:', error);
        stopQrScanner();
        setQrCameraMessage('Camera permission was denied or the camera is unavailable.', 'danger');
    }
}

function scanQrFrame(video, canvas) {
    if (!qrCameraStream || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });

    if (code?.data) {
        const input = document.getElementById('qrCodeInput');
        if (input) input.value = code.data;
        stopQrScanner();
        setVerificationResult('info', 'QR code scanned. Finding the appointment...');
        verifyAppointmentQr();
        return;
    }

    qrScanFrame = requestAnimationFrame(() => scanQrFrame(video, canvas));
}

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
            qr_code_data: qrCodeData,
            confirm: false
        });

        if (result && result.success && result.appointment) {
            pendingQrAppointment = result.appointment;
            setVerificationResult('info', 'Appointment found. Review the customer details, then confirm.');
            showVerificationDetails(result.appointment);
            const confirmButton = document.getElementById('confirmScannedAppointmentButton');
            if (confirmButton) confirmButton.classList.remove('d-none');
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

async function confirmScannedAppointment() {
    const input = document.getElementById('qrCodeInput');
    const button = document.getElementById('confirmScannedAppointmentButton');
    const qrCodeData = input?.value.trim();
    if (!pendingQrAppointment || !qrCodeData) {
        setVerificationResult('warning', 'Scan an appointment QR code first.');
        return;
    }

    if (button) {
        button.disabled = true;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Confirming';
    }
    try {
        const result = await apiCall('/staff/appointments/verify', 'POST', {
            qr_code_data: qrCodeData,
            confirm: true
        });
        if (result && result.success) {
            setVerificationResult('success', 'Appointment confirmed successfully.');
            pendingQrAppointment = null;
            if (input) input.value = '';
            if (button) button.classList.add('d-none');
            showVerificationDetails(result.appointment);
            await loadDashboard();
            await loadAllAppointments();
        } else {
            setVerificationResult('danger', result?.message || 'Appointment confirmation failed.');
        }
    } catch (error) {
        console.error('Appointment confirmation error:', error);
        setVerificationResult('danger', 'Appointment confirmation failed.');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<i class="fas fa-check"></i> Confirm Scanned Appointment';
        }
    }
}
