import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Users, Clock, ShieldAlert, Download, Unlock, Search, Filter, RefreshCw, CheckCircle2, AlertTriangle, UserCheck } from 'lucide-react';

export default function AdminDashboard({ user, profile }) {
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [searchTerm, setSearchTerm] = useState('');
  const [unlockingId, setUnlockingId] = useState(null);
  const [toast, setToast] = useState(null);

  // 1. Fetch Logs & Employees
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch employees
      const { data: empData, error: empErr } = await supabase
        .from('profiles')
        .select('id, full_name, email, role, status, bound_device_id, workplaces(name)')
        .order('full_name', { ascending: true });

      if (empData) setEmployees(empData);

      // Fetch logs for selected date
      const startOfDay = new Date(filterDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(filterDate);
      endOfDay.setHours(23, 59, 59, 999);

      const { data: logData, error: logErr } = await supabase
        .from('attendance_logs')
        .select('id, employee_id, action_type, scan_time, device_fingerprint, notes, profiles(full_name, email, role), workplaces(name)')
        .gte('scan_time', startOfDay.toISOString())
        .lte('scan_time', endOfDay.toISOString())
        .order('scan_time', { ascending: false });

      if (logData) setLogs(logData);
    } catch (e) {
      console.error('Admin fetch err:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [filterDate]);

  // 2. Real-Time Subscription (Auto-refresh on scan!)
  useEffect(() => {
    const channel = supabase
      .channel('admin_realtime_logs')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'attendance_logs' },
        (payload) => {
          console.log('Realtime new log:', payload);
          fetchData();
          setToast('🔔 Nouveau pointage enregistré en temps réel !');
          setTimeout(() => setToast(null), 5000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filterDate]);

  // 3. Unlock Device Lock for Employee
  const handleUnlockDevice = async (employeeId, name) => {
    if (!window.confirm(`Voulez-vous vraiment déverrouiller et réinitialiser l'appareil lié de ${name} ? Il pourra pointer depuis un nouveau téléphone.`)) {
      return;
    }

    setUnlockingId(employeeId);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ bound_device_id: null })
        .eq('id', employeeId);

      if (error) throw error;
      setToast(`🔓 Appareil de ${name} déverrouillé avec succès !`);
      await fetchData();
    } catch (e) {
      alert(`Erreur: ${e.message}`);
    } finally {
      setUnlockingId(null);
      setTimeout(() => setToast(null), 5000);
    }
  };

  // 4. Export CSV Report
  const handleExportCSV = () => {
    if (logs.length === 0) {
      alert('Aucune donnée à exporter pour cette date.');
      return;
    }

    const headers = ['ID', 'Employé', 'Email', 'Action', 'Heure (Serveur)', 'Lieu de travail', 'Empreinte Appareil', 'Notes'];
    const rows = logs.map(l => [
      l.id,
      l.profiles?.full_name || 'Inconnu',
      l.profiles?.email || '',
      l.action_type === 'check_in' ? 'ENTREE' : 'SORTIE',
      new Date(l.scan_time).toLocaleString('fr-DZ'),
      l.workplaces?.name || 'Siège',
      l.device_fingerprint || '',
      l.notes || ''
    ]);

    let csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.map(x => `"${x}"`).join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `rapport_pointage_pyjamadz_${filterDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter employees & logs by search
  const filteredLogs = logs.filter(l => 
    (l.profiles?.full_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (l.profiles?.email || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalEmployees = employees.length;
  const boundEmployees = employees.filter(e => e.bound_device_id).length;
  const presentNow = new Set(logs.filter(l => l.action_type === 'check_in').map(l => l.employee_id)).size;

  if (profile?.role !== 'admin' && profile?.role !== 'manager') {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center text-white">
        <ShieldAlert className="w-16 h-16 text-red-500 mb-4 animate-bounce" />
        <h2 className="text-2xl font-bold">Accès Réservé à la Direction</h2>
        <p className="text-sm text-slate-400 mt-2 max-w-md">
          Cette section est strictement réservée aux administrateurs et managers de Pyjama DZ.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 animate-fade-in">
      
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-gradient-to-r from-emerald-600 to-indigo-600 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 font-bold text-sm animate-bounce-short border border-white/20">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
        <div>
          <span className="px-3 py-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 rounded-full text-xs font-bold uppercase tracking-wider">
            Supervision Direction
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-white mt-2">
            Tableau de Bord & Audit En Temps Réel
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Surveillez les pointages des employés, gérez les appareils liés et exportez la paie.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs sm:text-sm rounded-xl border border-slate-700 transition-all flex items-center gap-2 shadow-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Actualiser</span>
          </button>

          <button
            onClick={handleExportCSV}
            className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-bold text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            <span>Exporter CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4 group-hover:scale-110 transition-transform">
            <UserCheck className="w-6 h-6" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Présents Actuellement
          </span>
          <span className="text-3xl font-black text-white mt-1 block">
            {presentNow} <span className="text-xs font-normal text-slate-500">/ {totalEmployees}</span>
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 group-hover:scale-110 transition-transform">
            <Users className="w-6 h-6" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Total Effectif
          </span>
          <span className="text-3xl font-black text-white mt-1 block">
            {totalEmployees} <span className="text-xs font-normal text-slate-500">employés</span>
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="w-12 h-12 rounded-2xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400 mb-4 group-hover:scale-110 transition-transform">
            <Clock className="w-6 h-6" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Pointages Aujourd'hui
          </span>
          <span className="text-3xl font-black text-white mt-1 block">
            {logs.length} <span className="text-xs font-normal text-slate-500">scans</span>
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-xl relative overflow-hidden group">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mb-4 group-hover:scale-110 transition-transform">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
            Appareils Verrouillés
          </span>
          <span className="text-3xl font-black text-white mt-1 block">
            {boundEmployees} <span className="text-xs font-normal text-slate-500">téléphones liés</span>
          </span>
        </div>

      </div>

      {/* Main Content Grid: Logs Feed & Employee Device Manager */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column (8 cols): Live Attendance Feed Table */}
        <div className="lg:col-span-8 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Clock className="w-5 h-5 text-emerald-400" />
                Journal des Pointages
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Flux en direct certifié par horodatage serveur PostgreSQL.
              </p>
            </div>

            {/* Date & Search Filters */}
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs font-semibold text-white focus:outline-none focus:border-emerald-500"
              />
              
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Chercher employé..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 pr-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 w-40 sm:w-48"
                />
              </div>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4">Employé</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Heure Serveur</th>
                  <th className="py-3 px-4">Lieu</th>
                  <th className="py-3 px-4">Détails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-8 text-center text-slate-500">
                      Aucun pointage trouvé pour cette sélection.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const isIn = log.action_type === 'check_in';
                    return (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-white">
                          {log.profiles?.full_name || 'Employé Supprimé'}
                          <span className="block text-[10px] text-slate-400 font-normal">
                            {log.profiles?.email}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[10px] ${
                            isIn ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/15 text-red-400 border border-red-500/30'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isIn ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
                            {isIn ? 'ENTRÉE' : 'SORTIE'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono font-bold text-emerald-300">
                          {new Date(log.scan_time).toLocaleTimeString('fr-DZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </td>

                        <td className="py-3.5 px-4 text-slate-300">
                          {log.workplaces?.name || 'Siège Principal'}
                        </td>

                        <td className="py-3.5 px-4 text-[11px] text-slate-400 truncate max-w-[150px]" title={log.notes}>
                          {log.notes || 'Scan PWA OK'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column (4 cols): Device Locking & Employee Management */}
        <div className="lg:col-span-4 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 self-start">
          <div className="pb-4 border-b border-slate-800">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-indigo-400" />
              Verrouillage Téléphones
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Si un employé perd ou change de smartphone, déverrouillez son accès ici.
            </p>
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {employees.map((emp) => {
              const isLocked = !!emp.bound_device_id;
              const isUnlocking = unlockingId === emp.id;
              return (
                <div
                  key={emp.id}
                  className="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/60 flex items-center justify-between gap-3 hover:border-slate-600 transition-all"
                >
                  <div className="overflow-hidden">
                    <span className="text-xs font-bold text-white block truncate">
                      {emp.full_name}
                    </span>
                    <span className="text-[10px] text-slate-400 block truncate">
                      {emp.email}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider mt-1 px-1.5 py-0.5 rounded ${
                      isLocked ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-700 text-slate-400'
                    }`}>
                      {isLocked ? '🔒 Lié au téléphone' : '🔓 Non lié (Libre)'}
                    </span>
                  </div>

                  {isLocked && (
                    <button
                      onClick={() => handleUnlockDevice(emp.id, emp.full_name)}
                      disabled={isUnlocking}
                      className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-[11px] font-bold shrink-0 transition-all flex items-center gap-1 shadow-sm"
                      title="Réinitialiser l'appareil lié"
                    >
                      <Unlock className={`w-3.5 h-3.5 ${isUnlocking ? 'animate-spin' : ''}`} />
                      <span>{isUnlocking ? '...' : 'Déverrouiller'}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>

    </div>
  );
}
