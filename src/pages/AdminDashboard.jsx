import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { unlockUserDevice } from '../services/deviceService';
import { seedDemoAccounts } from '../services/authService';
import { Users, Clock, Smartphone, Unlock, Download, RefreshCw, Check, Building2, UserCheck, Search, LogOut, Sparkles, Trash2, Ban } from 'lucide-react';
import EmployeeHistoryModal from '../components/EmployeeHistoryModal';
import OfflineWorkerEnrollment from '../components/OfflineWorkerEnrollment';

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
  const [siteFilter, setSiteFilter] = useState('ALL'); // 'ALL' | 'depot' | 'atelier' | 'magasin'
  const [validationSites, setValidationSites] = useState({});

  // Get YYYY-MM-DD specifically in Algeria/Chlef timezone (Africa/Algiers, UTC+1)
  const getAlgiersDateString = (dateObj) => {
    // Algiers is UTC+1. Get the UTC time, add 1 hour, and return the ISO date part.
    // This is 100% cross-browser compatible and guarantees YYYY-MM-DD.
    const utcTime = dateObj.getTime();
    const algiersTime = utcTime + (3600 * 1000);
    const d = new Date(algiersTime);
    return d.toISOString().split('T')[0];
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
        .gte('scan_time', startOfDay)
        .lte('scan_time', endOfDay)
        .order('scan_time', { ascending: false });

      if (lErr) throw lErr;
      setAttendanceLogs(logs || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      alert('Erreur fetchData: ' + (error.message || error));
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
    const selectedSite = validationSites[empId];
    if (!selectedSite) {
      alert("Veuillez sélectionner un site (Dépôt, Atelier ou Magasin) avant de valider cet employé.");
      return;
    }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ status: 'active', work_site: selectedSite })
        .eq('id', empId)
        .select();

      if (error) throw error;
      
      if (!data || data.length === 0) {
        throw new Error("Impossible de mettre à jour. Vous n'avez peut-être pas les permissions.");
      }

      setActionMessage({ type: 'success', text: `✅ L'employé "${empName}" a été validé !` });
      fetchData();
      setTimeout(() => setActionMessage(null), 5000);
    } catch (e) {
      alert(`Erreur de validation : ${e.message}`);
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
      alert(`Erreur : ${e.message}`);
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
      alert(`Erreur de suppression : ${e.message}`);
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
      l.scan_time,
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
    
    const matchesStatus = filterStatus === 'ALL' || emp.status === filterStatus;
    // For older entries where work_site might be null, treat them as 'depot' in the UI
    const empSite = emp.work_site || 'depot';
    const matchesSite = siteFilter === 'ALL' || empSite === siteFilter;

    return matchesSearch && matchesStatus && matchesSite;
  });

  const pendingCount = employees.filter(e => e.status === 'pending').length;

  // Daily Attendance & Absence summary calculation
  const activeEmployees = employees.filter(e => e.status === 'active');
  const dailySummary = activeEmployees.map(emp => {
    const empLogs = attendanceLogs.filter(l => l.employee_id === emp.id);
    const scansCount = empLogs.length;
    const isPresent = scansCount > 0;
    
    // In attendanceLogs, logs are ordered by scan_time descending (newest first).
    // So empLogs[0] is the LATEST (most recent) scan!
    const latestLog = empLogs[0];
    const latestAction = latestLog ? (latestLog.action_type || '').toLowerCase() : null;
    
    // Current status:
    // 'absent' if 0 scans
    // 'weekend' if 0 scans AND it's a Friday
    // 'in' if latestAction === 'check_in' (or odd scans)
    // 'out' if latestAction === 'check_out' (or even scans > 0)
    let currentStatus = 'absent';
    
    // Check if selected date is a Friday (day 5 in UTC)
    const dayOfWeek = new Date(selectedDate).getUTCDay();

    if (scansCount > 0) {
      if (latestAction === 'check_in') {
        currentStatus = 'in';
      } else {
        currentStatus = 'out';
      }
    } else if (dayOfWeek === 5) {
      currentStatus = 'weekend';
    }

    const firstIn = [...empLogs].reverse().find(l => (l.action_type || '').toLowerCase() === 'check_in');
    const lastOut = empLogs.find(l => (l.action_type || '').toLowerCase() === 'check_out');
    
    return {
      ...emp,
      isPresent,
      currentStatus,
      firstInTime: firstIn ? new Date(firstIn.scan_time).toLocaleTimeString('fr-DZ', { timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit' }) : null,
      lastOutTime: lastOut ? new Date(lastOut.scan_time).toLocaleTimeString('fr-DZ', { timeZone: 'Africa/Algiers', hour: '2-digit', minute: '2-digit' }) : null,
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
  }).filter(emp => {
    const empSite = emp.work_site || 'depot';
    return siteFilter === 'ALL' || empSite === siteFilter;
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
            {onLogout && (
              <button
                onClick={onLogout}
                title="Se déconnecter"
                className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 transition-all border border-slate-200 active:scale-95"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-8">
        

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
          </div>

          <OfflineWorkerEnrollment 
            workplaceId={profile.workplace_id} 
            onEmployeeAdded={fetchData} 
          />

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full justify-end mb-4">
            <div className="relative w-full sm:w-64">
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
                className="w-full sm:w-auto py-2 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tous ({employees.length})</option>
                <option value="pending">⏳ En attente ({pendingCount})</option>
                <option value="active">✅ Actifs ({employees.filter(e => e.status === 'active').length})</option>
              </select>
              <select
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                className="w-full sm:w-auto py-2 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tous les sites</option>
                <option value="depot">📦 Dépôt</option>
                <option value="atelier">🛠️ Atelier</option>
                <option value="magasin">🏪 Magasin</option>
              </select>
            </div>
          {/* Mobile Card View (hidden on desktop: block md:hidden) */}
          <div className="block md:hidden space-y-4">
            {filteredEmployees.map((emp) => (
              <div key={emp.id} className="p-4 bg-slate-50/80 border border-slate-200 rounded-2xl space-y-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 font-bold flex items-center justify-center shrink-0 text-base">
                      {emp.full_name?.charAt(0) || 'U'}
                    </div>
                    <div>
                      <div className="font-extrabold text-slate-900 text-sm">{emp.full_name || 'Sans Nom'}</div>
                      <div className="font-mono text-xs text-slate-500 font-bold">{emp.phone || emp.email || '---'}</div>
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full font-extrabold text-[10px] flex items-center gap-1 shrink-0 ${
                    emp.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800 border border-amber-300 animate-pulse'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${emp.status === 'active' ? 'bg-emerald-600' : 'bg-amber-600'}`}></span>
                    {emp.status === 'active' ? 'Actif' : 'En attente'}
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs py-2 border-y border-slate-200/60 flex-wrap gap-2">
                  <span className="text-slate-500 font-medium">Rôle : <strong className="text-slate-700">{emp.role === 'admin' ? '👑 Admin' : '📱 Employé'}</strong></span>
                  <span className="text-slate-500 font-medium">Site : <strong className="text-slate-700 uppercase">{(emp.work_site || 'depot') === 'depot' ? '📦 Dépôt' : (emp.work_site === 'atelier' ? '🛠️ Atelier' : '🏪 Magasin')}</strong></span>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  {emp.status === 'pending' && (
                    <div className="flex items-center gap-2 w-full">
                      <select
                        value={validationSites[emp.id] || ''}
                        onChange={(e) => setValidationSites({ ...validationSites, [emp.id]: e.target.value })}
                        className="flex-1 py-2 px-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold focus:outline-none"
                      >
                        <option value="" disabled>Saisir Site</option>
                        <option value="depot">📦 Dépôt</option>
                        <option value="atelier">🛠️ Atelier</option>
                        <option value="magasin">🏪 Magasin</option>
                      </select>
                      <button 
                        disabled={!validationSites[emp.id]}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleValidateEmployee(emp.id, emp.full_name); }} 
                        className={`flex-1 py-2 px-3 font-black rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                          !validationSites[emp.id]
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                        <span>Valider</span>
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-end gap-2 flex-wrap w-full">
                  {emp.status === 'active' && (
                    <button onClick={() => handleSuspendEmployee(emp.id, emp.full_name)} className="flex-1 py-2 px-3 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95">
                      <Ban className="w-4 h-4" />
                      <span>Bloquer</span>
                    </button>
                  )}
                  <button onClick={() => handleDeleteEmployee(emp.id, emp.full_name)} className="py-2 px-3 bg-red-50 hover:bg-red-600 text-red-600 hover:text-white border border-red-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 active:scale-95">
                    <Trash2 className="w-4 h-4" />
                    <span>Supprimer</span>
                  </button>
                  </div>
                </div>
              </div>
            ))}
            {filteredEmployees.length === 0 && (
              <div className="py-8 text-center text-slate-400 font-medium bg-slate-50 rounded-2xl">
                Aucun employé trouvé.
              </div>
            )}
          </div>

          {/* Employee Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-4">Employé</th>
                  <th className="py-3 px-4">Téléphone / ID</th>
                  <th className="py-3 px-4">Rôle</th>
                  <th className="py-3 px-4">Statut</th>
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
                      <div className="flex flex-col gap-1">
                        <span className={`px-2.5 py-1 rounded-full font-bold text-[10px] uppercase w-fit ${
                          emp.role === 'admin' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {emp.role === 'admin' ? '👑 Admin' : '📱 Employé'}
                        </span>
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase">
                          {(emp.work_site || 'depot') === 'depot' ? '📦 Dépôt' : (emp.work_site === 'atelier' ? '🛠️ Atelier' : '🏪 Magasin')}
                        </span>
                      </div>
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

                    <td className="py-4 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        
                        {/* VALIDATE / APPROVE BUTTON FOR PENDING EMPLOYEES */}
                        {emp.status === 'pending' && (
                          <div className="flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
                            <select
                              value={validationSites[emp.id] || ''}
                              onChange={(e) => setValidationSites({ ...validationSites, [emp.id]: e.target.value })}
                              className="py-1 px-2 bg-white border border-slate-300 rounded-lg text-xs font-bold focus:outline-none"
                            >
                              <option value="" disabled>Saisir Site</option>
                              <option value="depot">📦 Dépôt</option>
                              <option value="atelier">🛠️ Atelier</option>
                              <option value="magasin">🏪 Magasin</option>
                            </select>
                            <button
                              disabled={!validationSites[emp.id]}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleValidateEmployee(emp.id, emp.full_name); }}
                              className={`px-2.5 py-1.5 font-black rounded-lg text-xs transition-all flex items-center gap-1 ${
                                !validationSites[emp.id]
                                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm'
                              }`}
                              title="Autoriser cet employé à scanner"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Valider</span>
                            </button>
                          </div>
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

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
              <select
                value={dateMode}
                onChange={(e) => {
                  const mode = e.target.value;
                  setDateMode(mode);
                  if (mode === 'today') setSelectedDate(getTodayString());
                  else if (mode === 'yesterday') setSelectedDate(getYesterdayString());
                }}
                className="w-full sm:w-auto py-2 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-extrabold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                  className="w-full sm:w-auto py-1.5 px-3 bg-white border-2 border-emerald-500 text-emerald-900 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm font-mono"
                />
              )}

              <select
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                className="w-full sm:w-auto py-2 px-3 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">Tous les sites</option>
                <option value="depot">📦 Dépôt</option>
                <option value="atelier">🛠️ Atelier</option>
                <option value="magasin">🏪 Magasin</option>
              </select>
            </div>
          </div>



          {/* SUMMARY & ABSENCES */}
          <div className="space-y-4 animate-fade-in">


              {/* Mobile Card View for Summary (hidden on desktop: block md:hidden) */}
              <div className="block md:hidden space-y-4">
                {[{id: 'depot', label: '📦 Dépôt'}, {id: 'atelier', label: '🛠️ Atelier'}, {id: 'magasin', label: '🏪 Magasin'}]
                  .filter(site => siteFilter === 'ALL' || siteFilter === site.id)
                  .map(site => {
                    const siteEmps = filteredSummary.filter(emp => (emp.work_site || 'depot') === site.id);
                    if (siteEmps.length === 0) return null;
                    return (
                      <div key={site.id} className="space-y-3">
                        {siteFilter === 'ALL' && (
                          <h4 className="text-[11px] font-black text-slate-700 uppercase px-1 border-b border-slate-200/80 pb-1 mt-4">{site.label}</h4>
                        )}
                        {siteEmps.map((emp) => (
                          <div
                            key={emp.id}
                            onClick={() => setSelectedEmployeeForHistory(emp)}
                            className={`p-4 rounded-2xl border transition-all cursor-pointer shadow-sm ${
                              emp.currentStatus === 'absent' ? 'bg-rose-50/70 border-rose-200' :
                              emp.currentStatus === 'out' ? 'bg-amber-50/50 border-amber-200' :
                              emp.currentStatus === 'weekend' ? 'bg-sky-50/50 border-sky-200' :
                              'bg-slate-50 border-slate-200'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full shrink-0 ${
                                  emp.currentStatus === 'in' ? 'bg-emerald-500 animate-pulse' :
                                  emp.currentStatus === 'out' ? 'bg-amber-500' :
                                  emp.currentStatus === 'weekend' ? 'bg-sky-500' :
                                  'bg-rose-500'
                                }`}></div>
                                <div>
                                  <div className="font-extrabold text-slate-900 text-sm underline decoration-dotted decoration-indigo-300">{emp.full_name || 'Inconnu'}</div>
                                  <div className="font-mono text-xs text-slate-500 font-bold">{emp.phone || emp.email || '---'}</div>
                                </div>
                              </div>
                              <div>
                                {emp.currentStatus === 'in' ? (
                                  <span className="px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 block text-center">
                                    🟢 EN POSTE
                                  </span>
                                ) : emp.currentStatus === 'out' ? (
                                  <span className="px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase bg-amber-100 text-amber-800 border border-amber-300 block text-center">
                                    🟡 SORTI(E)
                                  </span>
                                ) : emp.currentStatus === 'weekend' ? (
                                  <span className="px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase bg-sky-100 text-sky-800 border border-sky-300 block text-center">
                                    🌴 REPOS
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase bg-rose-100 text-rose-800 border border-rose-300 block text-center">
                                    🔴 ABSENT(E)
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200/60 text-xs font-mono">
                              <div className="bg-white p-2 rounded-xl border border-slate-200/60 flex flex-col">
                                <span className="text-[10px] text-slate-400 font-sans font-bold">1ère Entrée</span>
                                <span className="font-bold text-emerald-700">{emp.firstInTime || '--:--'}</span>
                              </div>
                              <div className="bg-white p-2 rounded-xl border border-slate-200/60 flex flex-col">
                                <span className="text-[10px] text-slate-400 font-sans font-bold">Dernière Sortie</span>
                                <span className="font-bold text-indigo-700">{emp.lastOutTime || '--:--'}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })
                }
                {filteredSummary.length === 0 && (
                  <div className="py-8 text-center text-slate-400 font-medium bg-slate-50 rounded-2xl">
                    Aucun employé dans cette catégorie pour le {selectedDate}.
                  </div>
                )}
              </div>

              {/* Desktop Table (hidden on mobile: hidden md:block) */}
              <div className="hidden md:block overflow-x-auto">
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
                  {[{id: 'depot', label: '📦 Dépôt'}, {id: 'atelier', label: '🛠️ Atelier'}, {id: 'magasin', label: '🏪 Magasin'}]
                    .filter(site => siteFilter === 'ALL' || siteFilter === site.id)
                    .map(site => {
                      const siteEmps = filteredSummary.filter(emp => (emp.work_site || 'depot') === site.id);
                      if (siteEmps.length === 0) return null;
                      return (
                        <tbody key={site.id} className="divide-y divide-slate-100 text-xs font-medium">
                          {siteFilter === 'ALL' && (
                            <tr>
                              <td colSpan="5" className="py-2.5 px-4 bg-slate-50 text-[11px] font-black text-slate-700 uppercase border-y border-slate-200 shadow-sm">
                                {site.label}
                              </td>
                            </tr>
                          )}
                          {siteEmps.map((emp) => (
                            <tr
                              key={emp.id}
                              onClick={() => setSelectedEmployeeForHistory(emp)}
                              title="👉 Cliquez pour voir l'historique et la chronologie 24h détaillée"
                              className={`hover:bg-indigo-50/60 cursor-pointer transition-all ${
                                emp.currentStatus === 'absent' ? 'bg-rose-50/40' :
                                emp.currentStatus === 'out' ? 'bg-amber-50/30' :
                                emp.currentStatus === 'weekend' ? 'bg-sky-50/40' : ''
                              }`}
                            >
                              <td className="py-3.5 px-4 font-bold text-slate-900">
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${
                                    emp.currentStatus === 'in' ? 'bg-emerald-500' :
                                    emp.currentStatus === 'out' ? 'bg-amber-500' :
                                    emp.currentStatus === 'weekend' ? 'bg-sky-500' :
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
                                    🟡 SORTI(E)
                                  </span>
                                ) : emp.currentStatus === 'weekend' ? (
                                  <span className="px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase bg-sky-100 text-sky-800 border border-sky-300">
                                    🌴 REPOS
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
                        </tbody>
                      );
                    })
                  }
                  {filteredSummary.length === 0 && (
                    <tbody>
                      <tr>
                        <td colSpan="5" className="py-8 text-center text-slate-400 font-medium">
                          Aucun employé dans cette catégorie pour le {selectedDate}.
                        </td>
                      </tr>
                    </tbody>
                  )}
                </table>
              </div>
            </div>
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
