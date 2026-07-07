// ============================================================================
// Pyjama DZ Pointeuse: Attendance Processing Service (Check-In / Check-Out)
// ============================================================================
import { supabase } from '../lib/supabase';
import { validateQRToken } from './qrService';
import { verifyOrBindDevice } from './deviceService';

/**
 * Processes a scanned QR token string for an employee
 */
export async function processAttendanceScan(userId, scannedTokenString) {
  // 1. Verify Device Lock & Profile Status
  const deviceCheck = await verifyOrBindDevice(userId);
  const profile = deviceCheck.profile;
  const fingerprint = deviceCheck.fingerprint;

  if (!profile.workplace_id) {
    throw new Error('Erreur : Votre compte n\'est assigné à aucun lieu de travail (Workplace). Contactez l\'administrateur.');
  }

  // 2. Fetch Workplace details & Secret
  const { data: workplace, error: wpErr } = await supabase
    .from('workplaces')
    .select('id, name, qr_secret')
    .eq('id', profile.workplace_id)
    .single();

  if (wpErr || !workplace) {
    throw new Error('Lieu de travail introuvable ou indisponible.');
  }

  // 3. Validate Dynamic QR Code Token
  const qrValidation = await validateQRToken(workplace.id, workplace.qr_secret, scannedTokenString);
  if (!qrValidation.valid) {
    throw new Error(qrValidation.error);
  }

  // 4. Determine Action Type (Check-In vs Check-Out)
  // Fetch the employee's last scan today (UTC date)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: lastLogs, error: logErr } = await supabase
    .from('attendance_logs')
    .select('id, action_type, scan_time')
    .eq('employee_id', userId)
    .gte('scan_time', todayStart.toISOString())
    .order('scan_time', { ascending: false })
    .limit(1);

  let nextAction = 'check_in';
  let lastScanTime = null;

  if (lastLogs && lastLogs.length > 0) {
    const lastLog = lastLogs[0];
    lastScanTime = new Date(lastLog.scan_time);
    
    // If last action was check_in, next action MUST be check_out!
    if (lastLog.action_type === 'check_in') {
      nextAction = 'check_out';
    } else {
      nextAction = 'check_in';
    }

    // Anti-Spam protection: Prevent double scans within 60 seconds
    const secondsSinceLastScan = (Date.now() - lastScanTime.getTime()) / 1000;
    if (secondsSinceLastScan < 60) {
      const remaining = Math.ceil(60 - secondsSinceLastScan);
      throw new Error(`⏱️ Patientez encore ${remaining} secondes avant de repointers.`);
    }
  }

  // 5. Insert Attendance Log (Server timestamp is handled by PostgreSQL default now())
  const { data: newLog, error: insertErr } = await supabase
    .from('attendance_logs')
    .insert([
      {
        employee_id: userId,
        workplace_id: workplace.id,
        action_type: nextAction,
        device_fingerprint: fingerprint,
        qr_token_used: scannedTokenString,
        notes: deviceCheck.isNewBinding ? 'Premier pointage - Appareil lié automatiquement' : 'Pointage vérifié via QR Code dynamique'
      }
    ])
    .select()
    .single();

  if (insertErr || !newLog) {
    console.error('Insert error:', insertErr);
    throw new Error('Erreur lors de l\'enregistrement du pointage sur le serveur.');
  }

  // 6. Return comprehensive success payload
  return {
    success: true,
    action: nextAction,
    actionLabel: nextAction === 'check_in' ? '🟢 ENTRÉE ENREGISTRÉE' : '🔴 SORTIE ENREGISTRÉE',
    scanTime: newLog.scan_time,
    workplaceName: workplace.name,
    employeeName: profile.full_name,
    isNewBinding: deviceCheck.isNewBinding,
    message: nextAction === 'check_in' 
      ? `Bonne journée de travail, ${profile.full_name} ! Entrée pointée à ${new Date(newLog.scan_time).toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' })}.`
      : `Bon repos, ${profile.full_name} ! Sortie pointée à ${new Date(newLog.scan_time).toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' })}.`
  };
}

/**
 * Fetch employee today's attendance summary & logs
 */
export async function getEmployeeTodayStatus(userId) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: logs, error } = await supabase
    .from('attendance_logs')
    .select('id, action_type, scan_time, workplace_id, workplaces(name)')
    .eq('employee_id', userId)
    .gte('scan_time', todayStart.toISOString())
    .order('scan_time', { ascending: true });

  if (error) {
    console.error('Error fetching logs:', error);
    return { logs: [], currentStatus: 'out', totalHoursToday: 0 };
  }

  let currentStatus = 'out';
  if (logs && logs.length > 0) {
    const lastLog = logs[logs.length - 1];
    currentStatus = lastLog.action_type === 'check_in' ? 'in' : 'out';
  }

  // Calculate approximate hours today
  let totalHoursToday = 0;
  for (let i = 0; i < logs.length; i += 2) {
    if (logs[i] && logs[i].action_type === 'check_in' && logs[i + 1] && logs[i + 1].action_type === 'check_out') {
      const inTime = new Date(logs[i].scan_time);
      const outTime = new Date(logs[i + 1].scan_time);
      totalHoursToday += (outTime - inTime) / (1000 * 60 * 60);
    }
  }

  return {
    logs: logs || [],
    currentStatus,
    totalHoursToday: Math.round(totalHoursToday * 100) / 100
  };
}

/**
 * Toggle attendance (manual check-in / check-out button or scanner trigger)
 */
export async function toggleAttendance(userId, workplaceId, fingerprint) {
  const statusObj = await getEmployeeTodayStatus(userId);
  const nextAction = statusObj.currentStatus === 'in' ? 'check_out' : 'check_in';
  
  const { data: newLog, error } = await supabase
    .from('attendance_logs')
    .insert([{
      employee_id: userId,
      workplace_id: workplaceId || null,
      action_type: nextAction,
      scan_time: new Date().toISOString(),
      device_fingerprint: typeof fingerprint === 'string' ? fingerprint : 'device_mobile'
    }])
    .select()
    .single();

  if (error) {
    throw new Error("Erreur de pointage : " + error.message);
  }

  return {
    action: nextAction === 'check_in' ? 'CHECK_IN' : 'CHECK_OUT',
    message: nextAction === 'check_in' ? "Pointage d'entrée enregistré avec succès !" : "Pointage de sortie enregistré avec succès !",
    log: newLog
  };
}

/**
 * Returns today's summary formatted for EmployeeScanner
 */
export async function getTodaySummary(userId) {
  const statusObj = await getEmployeeTodayStatus(userId);
  let checkInTime = null;
  let checkOutTime = null;
  
  if (statusObj.logs && statusObj.logs.length > 0) {
    const firstIn = statusObj.logs.find(l => l.action_type === 'check_in');
    if (firstIn) checkInTime = new Date(firstIn.scan_time).toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' });
    const lastOut = [...statusObj.logs].reverse().find(l => l.action_type === 'check_out');
    if (lastOut) checkOutTime = new Date(lastOut.scan_time).toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit' });
  }

  return {
    status: statusObj.currentStatus === 'in' ? 'IN' : 'OUT',
    totalHours: statusObj.totalHoursToday || 0,
    checkInTime: checkInTime || '--:--',
    checkOutTime: checkOutTime || '--:--'
  };
}

