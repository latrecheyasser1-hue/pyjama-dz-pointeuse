import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { unlockUserDevice } from '../services/deviceService';
import { seedDemoAccounts } from '../services/authService';
import { Users, Clock, Smartphone, Unlock, Download, RefreshCw, Check, Building2, UserCheck, Search, LogOut, Sparkles, Trash2, Ban } from 'lucide-react';

export default function AdminDashboard({ user, profile, onLogout }) {
  const [employees, setEmployees] = useState([]);
  const [attendanceLogs, setAttendanceLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL'); // 'ALL' | 'pending' | 'active'

  // 1. Fetch all employees & today's logs
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

      // 1.2 Fetch today's logs
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data: logs, error: lErr } = await supabase
        .from('attendance_logs')
        .select('*, profiles(full_name, phone, email, role)')
        .gte('server_timestamp', startOfDay.toISOString())
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
  }, []);

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
      l.action_type === 'CHECK_IN' ? 'ENTREE' : 'SORTIE',
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
            <div className="text-right hidden sm:block">
              <span className="text-xs font-bold text-slate-800 block">
                {profile?.full_name || 'Direction'}
              </span>
              <span className="text-[10px] font-semibold text-indigo-600 uppercase">
                👑 Administrateur
              </span>
            </div>

            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-slate-200 hover:border-red-200 text-xs font-bold"
              title="Se déconnecter"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Quitter</span>
            </button>
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

        {/* EMPLOYEE MANAGEMENT SECTION (WITH VALIDATION BUTTONS) */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-md space-y-6">
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

        {/* LIVE ATTENDANCE LOGS FEED */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-md space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900">
                Flux des Pointages en Temps Réel (Aujourd'hui)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Horodatage centralisé côté serveur • Aucun risque de triche d'heure
              </p>
            </div>
            <span className="text-xs font-bold font-mono px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-ping"></span> Live Realtime
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                  <th className="py-3 px-4">Employé</th>
                  <th className="py-3 px-4">Téléphone</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Heure Serveur (UTC)</th>
                  <th className="py-3 px-4">Statut Sécurité</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-medium">
                {attendanceLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      {log.profiles?.full_name || 'Inconnu'}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      {log.profiles?.phone || log.profiles?.email || '---'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-1 rounded-full font-extrabold text-[10px] uppercase ${
                        log.action_type === 'CHECK_IN'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {log.action_type === 'CHECK_IN' ? '🟢 ENTRÉE' : '🛑 SORTIE'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-700 font-bold">
                      {new Date(log.server_timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
                      Aucun pointage enregistré aujourd'hui.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      <footer className="py-4 border-t border-slate-200 bg-slate-50 text-center text-xs text-slate-500 mt-auto">
        <span className="font-bold text-slate-700">Pyjama DZ</span> — Portail Direction & Paie (100% Autonome)
      </footer>
    </div>
  );
}
