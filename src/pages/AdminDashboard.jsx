import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { unlockUserDevice } from '../services/deviceService';
import { seedDemoAccounts } from '../services/authService';
import { Users, Clock, Smartphone, Unlock, Download, RefreshCw, Check, Building2, UserCheck, Search, LogOut, Sparkles, Trash2, Ban } from 'lucide-react';
import EmployeeHistoryModal from '../components/EmployeeHistoryModal';

export default function AdminDashboard({ user, profile, onLogout }) {
  const [employees, setEmployees] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'pending' | 'active'
  const [activeTab, setActiveTab] = useState('employees'); // 'employees' | 'attendance'
  const [attendanceSubTab, setAttendanceSubTab] = useState('summary'); // 'summary' | 'logs'
  const [presenceFilter, setPresenceFilter] = useState('ALL'); // 'ALL' | 'present' | 'absent'
  const [selectedEmployeeForHistory, setSelectedEmployeeForHistory] = useState(null);

  // Get YYYY-MM-DD specifically in Algeria/Chlef timezone (Africa/Algiers, UTC+1)
  const getAlgiersDateString = (date = new Date()) => {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Africa/Algiers',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${year}-${month}-${day}`;
  };

  const getTodayString = () => getAlgiersDateString(new Date());
  const getYesterdayString = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getAlgiersDateString(d);
  };

  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [dateMode, setDateMode] = useState('today'); // 'today' | 'yesterday' | 'custom'

  // 1. Fetch all employees & logs for selectedDate
  const fetchData = async () => {
    setLoading(true);
    try {
      // 1.1 Fetch profiles
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (pErr) throw pErr;
      setEmployees((profs || []).filter(p => p.role !== 'admin'));

      // 1.2 Fetch logs for selectedDate in Algeria/Chlef timezone (UTC+01:00)
      const startOfDay = `${selectedDate}T00:00:00.000+01:00`;
      const endOfDay = `${selectedDate}T23:59:59.999+01:00`;

      const { data: logs, error: lErr } = await supabase
        .from('attendance_logs')
        .select('*, profiles(full_name, phone, email, role)')
        .gte('server_timestamp', startOfDay)
        .lte('server_timestamp', endOfDay)
        .order('server_timestamp', { ascending: false });

      if (lErr) throw lErr;
      setAttendanceLogs(logs || []);
    } catch (e) {
      console.error('Admin fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Realtime subscription for live attendance updates
    const subscription = supabase
      .channel('admin-live-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_logs' }, () => {
        fetchData();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [selectedDate]);

  // Seed Demo Accounts Helper
  const handleSeed = async () => {
    try {
      await seedDemoAccounts();
      fetchData();
      alert('✨ Comptes de test initialisés avec succès !');
    } catch (e) {
      console.error(e);
    }
  };

  // 2. Validate / Approve Pending Employee
  const handleValidateEmployee = async (empId, empName) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'active' })
        .eq('id', empId);

      if (error) throw error;

      setActionMessage({ type: 'success', text: `✅ L'employé "${empName}" a été validé et peut maintenant pointer !` });
      fetchData();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (e) {
      setActionMessage({ type: 'error', text: `Erreur de validation : ${e.message}` });
    }
  };

  // 2.2 Suspend / Stop Active Employee
  const handleSuspendEmployee = async (empId, empName) => {
    if (!window.confirm(`⚠️ Voulez-vous vraiment bloquer / suspendre l'accès de "${empName}" ?\n\nIl ne pourra plus scanner le QR code jusqu'à réactivation.`)) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: 'pending' })
        .eq('id', empId);

      if (error) throw error;

      setActionMessage({ type: 'success', text: `⏸️ L'employé "${empName}" a été bloqué et remis en attente.` });
      fetchData();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (e) {
      setActionMessage({ type: 'error', text: `Erreur : ${e.message}` });
    }
  };

  // 2.3 Delete Employee
  const handleDeleteEmployee = async (empId, empName) => {
    if (!window.confirm(`⚠️ Êtes-vous sûr de vouloir supprimer définitivement l'employé "${empName}" ?\n\nCette action supprimera également son compte et son historique.`)) return;

    try {
      await supabase.from('attendance_logs').delete().eq('employee_id', empId);
      const { error } = await supabase.from('profiles').delete().eq('id', empId);

      if (error) throw error;

      setActionMessage({ type: 'success', text: `🗑️ L'employé "${empName}" a été supprimé.` });
      fetchData();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (e) {
      setActionMessage({ type: 'error', text: `Erreur de suppression : ${e.message}` });
    }
  };

  // 3. Unlock Device Fingerprint
  const handleUnlockDevice = async (empId, empName) => {
    if (!window.confirm(`Êtes-vous sûr de vouloir réinitialiser l'appareil lié de "${empName}" ?`)) return;

    try {
      await unlockUserDevice(empId);
      setActionMessage({ type: 'success', text: `🔓 Appareil réinitialisé avec succès pour "${empName}". Il pourra lier un nouveau téléphone au prochain scan.` });
      fetchData();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (e) {
      setActionMessage({ type: 'error', text: e.message });
    }
  };

  // 4. Export CSV Report
  const handleExportCSV = () => {
    if (attendanceLogs.length === 0) {
      alert('Aucun pointage enregistré aujourd\'hui.');
      return;
    }

    const headers = ['ID Pointage', 'Employé', 'Téléphone', 'Type Action', 'Horodatage Serveur (UTC)', 'Statut Vérification'];
    const rows = attendanceLogs.map(l => [
      l.id,
      l.profiles?.full_name || 'Inconnu',
      l.profiles?.phone || l.profiles?.email || '---',
      (l.action_type || '').toLowerCase() === 'check_in' ? 'ENTREE' : 'SORTIE',
      l.server_timestamp,
      l.verification_status
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pyjamadz_paie_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtered employees
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = (emp.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (emp.phone || '').includes(searchTerm) ||
                          (emp.email || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (filterStatus === 'ALL') return matchesSearch;
    return matchesSearch && emp.status === filterStatus;
  });

  const pendingCount = employees.filter(e => e.status === 'pending').length;

  // Daily Attendance & Absence summary calculation
  const activeEmployees = employees.filter(e => e.status === 'active');
  const dailySummary = activeEmployees.map(emp => {
    const empLogs = attendanceLogs.filter(l => l.employee_id === emp.id);
    const scansCount = empLogs.length;
    const isPresent = scansCount > 0;
    
    // In attendanceLogs, logs are ordered by server_timestamp descending (newest first).
    // So empLogs[0] is the LATEST (most recent) scan!
    const latestLog = empLogs[0];
    const latestAction = latestLog ? (latestLog.action_type || '').toLowerCase() : null;
    
    // Current status:
    // 'absent' if 0 scans
    // 'in' if latestAction === 'check_in' (or odd scans)
    // 'out' if latestAction === 'check_out' (or even scans > 0)
    let currentStatus = 'absent';
    if (scansCount > 0) {
      if (latestAction === 'check_in') {
        currentStatus = 'in';
      } else {
        currentStatus = 'out';
      }
    }

    const firstIn = [...empLogs].reverse().find(l => (l.action_type || '').toLowerCase() === 'check_in');
    const lastOut = empLogs.find(l => (l.action_type || '').toLowerCase() === 'check_out');
    
    return {
      ...emp,
      isPresent,
      currentStatus,
      firstInTime: firstIn ? new Date(firstIn.server_timestamp).toLocaleTimeString('fr-DZ', { timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit' }) : null,
      lastOutTime: lastOut ? new Date(lastOut.server_timestamp).toLocaleTimeString('fr-DZ', { timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit' }) : null,
      scansCount
    };
  });

  const inCount = dailySummary.filter(e => e.currentStatus === 'in').length;
  const outCount = dailySummary.filter(e => e.currentStatus === 'out').length;
  const absentCount = dailySummary.filter(e => e.currentStatus === 'absent').length;

  const filteredSummary = dailySummary.filter(emp => {
    if (presenceFilter === 'in') return emp.currentStatus === 'in';
    if (presenceFilter === 'out') return emp.currentStatus === 'out';
    if (presenceFilter === 'absent') return emp.currentStatus === 'absent';
    // Backwards compatibility if presenceFilter was 'present'
    if (presenceFilter === 'present') return emp.currentStatus !== 'absent';
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center gap-4 text-slate-900 font-sans">
        <div className="w-12 h-12 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full animate-spin"></div>
        <p className="text-slate-600 font-bold text-sm">Chargement du panneau Direction...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans">
      
      {/* Standalone Admin Header (No Navbar Links!) */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3 shadow-sm">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-slate-900 text-sm sm:text-lg leading-tight">
                Pyjama DZ <span className="text-indigo-600">Direction</span>
              </h1>
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Portail d'Administration 100% Autonome
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xs font-bold text-slate-800 block">
                {profile?.full_name || 'Direction'}
              </span>
              <span className="text-[10px] font-semibold text-indigo-600 uppercase">
                👑 Administrateur
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        
        {/* Top Title Bar */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              Supervision Générale & Paie
            </h2>
            <p className="text-xs text-slate-500 mt-1 font-medium">
              Validez les nouveaux inscrits, réinitialisez les téléphones et auditez les pointages en temps réel.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <button
              onClick={fetchData}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-all flex items-center gap-2 border border-slate-300"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Actualiser</span>
            </button>
          </div>
        </div>

        {/* Action Banner Notification */}
        {actionMessage && (
          <div className={`p-4 rounded-2xl border flex items-center justify-between shadow-sm animate-fade-in ${
            actionMessage.type === 'success' 
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
              : 'bg-red-50 border-red-200 text-red-900'
          }`}>
            <span className="text-xs font-bold">{actionMessage.text}</span>
            <button onClick={() => setActionMessage(null)} className="text-xs underline font-semibold">Fermer</button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-2 bg-slate-100/80 border border-slate-200/80 rounded-2xl shadow-inner">
          <button
            type="button"
            onClick={() => setActiveTab('employees')}
            className={`py-3.5 px-5 rounded-xl text-sm font-black flex items-center justify-center gap-2.5 transition-all ${
              activeTab === 'employees'
                ? 'bg-white text-indigo-700 shadow-md border border-slate-200/60 scale-[1.01]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Users className={`w-5 h-5 shrink-0 ${activeTab === 'employees' ? 'text-indigo-600' : 'text-slate-500'}`} />
            <span>👥 Gestion & Validation des Employés</span>
            {pendingCount > 0 && (
              <span className="ml-1 px-2 py-0.5 bg-amber-500 text-white rounded-full text-xs font-black animate-pulse">
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('attendance')}
            className={`py-3.5 px-5 rounded-xl text-sm font-black flex items-center justify-center gap-2.5 transition-all ${
              activeTab === 'attendance'
                ? 'bg-white text-emerald-700 shadow-md border border-slate-200/60 scale-[1.01]'
                : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
            }`}
          >
            <Clock className={`w-5 h-5 shrink-0 ${activeTab === 'attendance' ? 'text-emerald-600' : 'text-slate-500'}`} />
            <span>⏱️ Flux des Pointages en Temps Réel</span>
            <span className="ml-1 px-2 py-0.5 bg-emerald-100 text-emerald-800 font-mono rounded-full text-xs font-bold">
              {attendanceLogs.length}
            </span>
          </button>
        </div>

        {/* EMPLOYEE MANAGEMENT SECTION (WITH VALIDATION BUTTONS) */}
        {activeTab === 'employees' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-md space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900">
                Gestion & Validation des Employés
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Exigence : Les employés s'inscrivent par téléphone et doivent être validés par l'admin ici pour pouvoir scanner.
              </p>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Rechercher nom, téléphone..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                />
              </div>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="py-2 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tous ({employees.length})</option>
                <option value="pending">⏳ En attente ({pendingCount})</option>
                <option value="active">✅ Actifs ({employees.filter(e => e.status === 'active').length})</option>
              </select>
            </div>
          </div>

          {/* Employee Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-4">Employé</th>
                  <th className="py-3 px-4">Téléphone / ID</th>
                  <th className="py-3 px-4">Rôle</th>
                  <th className="py-3 px-4">Statut</th>
                  <th className="py-3 px-4">Appareil Lié</th>
                  <th className="py-3 px-4 text-right">Actions Direction</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                    
                    <td className="py-4 px-4 font-extrabold text-slate-900">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-xl bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0">
                          {emp.full_name?.charAt(0) || 'U'}
                        </div>
                        <span>{emp.full_name || 'Sans Nom'}</span>
                      </div>
                    </td>

                    <td className="py-4 px-4 font-mono font-bold text-slate-700">
                      {emp.phone || emp.email || '---'}
                    </td>

                    <td className="py-4 px-4">
                      <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] uppercase ${
                        emp.role === 'admin' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {emp.role === 'admin' ? '👑 Admin' : '📱 Employé'}
                      </span>
                    </td>

                    <td className="py-4 px-4">
                      <span className={`px-3 py-1 rounded-full font-extrabold text-[11px] flex items-center gap-1.5 w-fit ${
                        emp.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                      }`}>
                        <span className={`w-2 h-2 rounded-full ${emp.status === 'active' ? 'bg-emerald-600' : 'bg-amber-600'}`}></span>
                        {emp.status === 'active' ? '✅ Actif' : '⏳ En attente'}
                      </span>
                    </td>

                    <td className="py-4 px-4 font-mono text-slate-500">
                      {emp.bound_device_id ? (
                        <span className="text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                          🔒 Lié ({emp.bound_device_id.slice(0, 8)}...)
                        </span>
                      ) : (
                        <span className="text-slate-400">Non lié</span>
                      )}
                    </td>

                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        
                        {/* VALIDATE / APPROVE BUTTON FOR PENDING EMPLOYEES */}
                        {emp.status === 'pending' && (
                          <button
                            onClick={() => handleValidateEmployee(emp.id, emp.full_name)}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs transition-all shadow-sm flex items-center gap-1"
                            title="Autoriser cet employé à scanner"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Valider</span>
                          </button>
                        )}

                        {/* SUSPEND / STOP BUTTON FOR ACTIVE EMPLOYEES */}
                        {emp.status === 'active' && (
                          <button
                            onClick={() => handleSuspendEmployee(emp.id, emp.full_name)}
                            className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl text-xs transition-all shadow-sm flex items-center gap-1"
                            title="Bloquer / Suspendre cet employé"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Bloquer / Stop</span>
                          </button>
                        )}

                        {/* UNLOCK DEVICE BUTTON */}
                        {emp.bound_device_id && (
                          <button
                            onClick={() => handleUnlockDevice(emp.id, emp.full_name)}
                            className="px-2 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-300 hover:border-blue-300 font-bold rounded-xl text-xs transition-all flex items-center gap-1"
                            title="Réinitialiser l'appareil lié de l'employé"
                          >
                            <Unlock className="w-3.5 h-3.5" />
                            <span>🔓 Appareil</span>
                          </button>
                        )}

                        {/* DELETE BUTTON FOR ANY EMPLOYEE */}
                        <button
                          onClick={() => handleDeleteEmployee(emp.id, emp.full_name)}
                          className="px-2.5 py-1.5 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 hover:border-red-600 font-bold rounded-xl text-xs transition-all flex items-center gap-1"
                          title="Supprimer définitivement cet employé"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Supprimer</span>
                        </button>

                      </div>
                    </td>

                  </tr>
                ))}
                {filteredEmployees.length === 0 && (
                  <tr>
                    <td colSpan="6" className="py-8 text-center text-slate-400 font-medium">
                      Aucun employé trouvé.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        )}

        {/* LIVE ATTENDANCE LOGS FEED */}
        {activeTab === 'attendance' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-md space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900">
                Flux des Pointages ({selectedDate === getTodayString() ? "Aujourd'hui" : selectedDate === getYesterdayString() ? "Hier" : selectedDate})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Horodatage centralisé côté serveur • Aucun risque de triche d'heure
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
              <select
                value={dateMode}
                onChange={(e) => {
                  const mode = e.target.value;
                  setDateMode(mode);
                  if (mode === 'today') setSelectedDate(getTodayString());
                  else if (mode === 'yesterday') setSelectedDate(getYesterdayString());
                }}
                className="py-2 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="today">📅 Aujourd'hui ({getTodayString()})</option>
                <option value="yesterday">⏳ Hier ({getYesterdayString()})</option>
                <option value="custom">🔍 Choisir une date...</option>
              </select>

              {dateMode === 'custom' && (
                <input
                  type="date"
                  max={getTodayString()}
                  value={selectedDate}
                  onChange={(e) => {
                    if (e.target.value <= getTodayString()) {
                      setSelectedDate(e.target.value);
                    }
                  }}
                  className="py-1.5 px-3 bg-white border-2 border-emerald-500 text-emerald-900 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm font-mono"
                />
              )}

              <span className="text-xs font-bold font-mono px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1.5 ml-auto sm:ml-0">
                <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping"></span> Live
              </span>
            </div>
          </div>

          {/* Sub-tabs and KPI summary */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm flex-wrap">
              <button
                onClick={() => setAttendanceSubTab('summary')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
                  attendanceSubTab === 'summary'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📊 Bilan & Absences
              </button>
              <button
                onClick={() => setAttendanceSubTab('logs')}
                className={`px-4 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-2 ${
                  attendanceSubTab === 'logs'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📜 Historique des Scans ({attendanceLogs.length})
              </button>
            </div>

            {/* KPI counters */}
            <div className="flex items-center gap-3 text-xs font-extrabold flex-wrap">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm text-slate-700">
                👥 Total Actifs : <span className="font-mono text-slate-900">{activeEmployees.length}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl shadow-sm text-emerald-800">
                🟢 En poste : <span className="font-mono text-emerald-700">{inCount}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl shadow-sm text-amber-800">
                🟡 Sortis / Pause : <span className="font-mono text-amber-700">{outCount}</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-xl shadow-sm text-rose-800">
                🔴 Absents : <span className="font-mono text-rose-700">{absentCount}</span>
              </div>
            </div>
          </div>

          {/* TAB 1: SUMMARY & ABSENCES */}
          {attendanceSubTab === 'summary' && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center gap-2 border-b border-slate-200 pb-3 flex-wrap">
                <span className="text-xs font-extrabold text-slate-500 mr-2">Filtrer par statut :</span>
                <button
                  onClick={() => setPresenceFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    presenceFilter === 'ALL'
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Tout ({dailySummary.length})
                </button>
                <button
                  onClick={() => setPresenceFilter('in')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                    presenceFilter === 'in' || presenceFilter === 'present'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                  }`}
                >
                  🟢 En poste ({inCount})
                </button>
                <button
                  onClick={() => setPresenceFilter('out')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                    presenceFilter === 'out'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  }`}
                >
                  🟡 Sortis / Pause ({outCount})
                </button>
                <button
                  onClick={() => setPresenceFilter('absent')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                    presenceFilter === 'absent'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
                  }`}
                >
                  🔴 Absents ({absentCount})
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                      <th className="py-3 px-4">Employé</th>
                      <th className="py-3 px-4">Téléphone</th>
                      <th className="py-3 px-4">Statut ce jour</th>
                      <th className="py-3 px-4">1ère Entrée</th>
                      <th className="py-3 px-4">Dernière Sortie</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-medium">
                    {filteredSummary.map((emp) => (
                      <tr
                        key={emp.id}
                        onClick={() => setSelectedEmployeeForHistory(emp)}
                        title="👉 Cliquez pour voir l'historique et la chronologie 24h détaillée"
                        className={`hover:bg-indigo-50/60 cursor-pointer transition-all ${
                          emp.currentStatus === 'absent' ? 'bg-rose-50/40' :
                          emp.currentStatus === 'out' ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4 font-bold text-slate-900">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${
                              emp.currentStatus === 'in' ? 'bg-emerald-500' :
                              emp.currentStatus === 'out' ? 'bg-amber-500' :
                              'bg-rose-500 animate-pulse'
                            }`}></div>
                            <span className="group-hover:text-indigo-600 underline decoration-dotted decoration-indigo-300">{emp.full_name || 'Inconnu'}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600">
                          {emp.phone || emp.email || '---'}
                        </td>
                        <td className="py-3.5 px-4">
                          {emp.currentStatus === 'in' ? (
                            <span className="px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                              🟢 EN POSTE (Présent)
                            </span>
                          ) : emp.currentStatus === 'out' ? (
                            <span className="px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase bg-amber-100 text-amber-800 border border-amber-300">
                              🟡 SORTI(E) / PAUSE
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase bg-rose-100 text-rose-800 border border-rose-300">
                              🔴 ABSENT(E) (Aucun pointage)
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700 font-bold">
                          {emp.firstInTime ? (
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">{emp.firstInTime}</span>
                          ) : (
                            <span className="text-slate-400">--:--</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700 font-bold">
                          {emp.lastOutTime ? (
                            <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">{emp.lastOutTime}</span>
                          ) : (
                            <span className="text-slate-400">--:--</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {filteredSummary.length === 0 && (
                      <tr>
                        <td colSpan="5" className="py-8 text-center text-slate-400 font-medium">
                          Aucun employé dans cette catégorie pour le {selectedDate}.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 2: RAW ATTENDANCE LOGS */}
          {attendanceSubTab === 'logs' && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
            <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                <span>📜 Flux brut des pointages ({attendanceLogs.length})</span>
                <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold">
                  Heure Chlef / Algérie
                </span>
              </h3>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 tracking-wider bg-slate-50/50">
                  <th className="py-3 px-4">Employé</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Heure (Chlef)</th>
                  <th className="py-3 px-4">Message</th>
                  <th className="py-3 px-4">Sécurité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium">
                {attendanceLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {log.profiles?.full_name || 'Inconnu'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase border inline-flex items-center gap-1 ${
                        log.action === 'CHECK_IN'
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        {log.action === 'CHECK_IN' ? '🟢 ENTRÉE' : '🟡 SORTIE / PAUSE'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-700">
                      {new Date(log.server_timestamp).toLocaleTimeString('fr-FR', {
                        timeZone: 'Africa/Algiers',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">
                      {log.notes || 'Pointage normal'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                        ✔ Validé TOTP (30s)
                      </span>
                    </td>
                  </tr>
                ))}
                {attendanceLogs.length === 0 && (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-400 font-medium">
                      Aucun pointage enregistré pour le {selectedDate}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          )}
        </div>
        )}

      </main>

      {/* Employee History Modal */}
      {selectedEmployeeForHistory && (
        <EmployeeHistoryModal
          employee={selectedEmployeeForHistory}
          onClose={() => setSelectedEmployeeForHistory(null)}
        />
      )}

      <footer className="py-4 border-t border-slate-200 bg-slate-50 text-center text-xs text-slate-500 mt-auto">
        <span className="font-bold text-slate-700">Pyjama DZ</span> — Portail Direction & Paie (100% Autonome)
      </footer>
    </div>
  );
}
