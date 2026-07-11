import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function EmployeeHistoryModal({ employee, onClose }) {
  // Helper to get date string in Algeria/Chlef timezone (Africa/Algiers)
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

  // Default date range: Last 7 days up to today
  const todayStr = getAlgiersDateString();
  const getPastDateStr = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return getAlgiersDateString(d);
  };

  const [filterMode, setFilterMode] = useState('range'); // 'single' | 'range'
  const [singleDate, setSingleDate] = useState(todayStr);
  const [startDate, setStartDate] = useState(getPastDateStr(6)); // 7 days inclusive
  const [endDate, setEndDate] = useState(todayStr);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [daysData, setDaysData] = useState([]);
  
  // Totals
  const [totalWorkMins, setTotalWorkMins] = useState(0);
  const [totalPauseMins, setTotalPauseMins] = useState(0);
  const [totalAbsentDays, setTotalAbsentDays] = useState(0);

  // Quick preset buttons
  const applyPreset = (days) => {
    setFilterMode('range');
    setEndDate(todayStr);
    setStartDate(getPastDateStr(days - 1));
  };

  useEffect(() => {
    if (!employee) return;
    fetchHistory();
  }, [employee, startDate, endDate]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const startTimestamp = `${startDate}T00:00:00.000+01:00`;
      const endTimestamp = `${endDate}T23:59:59.999+01:00`;

      const { data, error } = await supabase
        .from('attendance_logs')
        .select('*')
        .eq('employee_id', employee.id)
        .gte('scan_time', startTimestamp)
        .lte('scan_time', endTimestamp)
        .order('scan_time', { ascending: true });

      if (error) throw error;
      setLogs(data || []);
      processDays(data || []);
    } catch (e) {
      console.error('Error fetching employee history:', e);
    } finally {
      setLoading(false);
    }
  };

  // Helper to convert ISO string to minute of day (0 to 1440) in Africa/Algiers
  const getMinuteOfDay = (isoString) => {
    const d = new Date(isoString);
    const timeStr = d.toLocaleTimeString('fr-FR', {
      timeZone: 'Africa/Algiers',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  };

  // Helper to format minute of day to HH:mm
  const formatTimeFromMinute = (totalMins) => {
    const h = Math.floor(totalMins / 60);
    const m = Math.floor(totalMins % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };

  // Helper to format ISO to Chlef time string HH:mm:ss
  const formatTimeChlef = (isoString) => {
    return new Date(isoString).toLocaleTimeString('fr-FR', {
      timeZone: 'Africa/Algiers',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const processDays = (fetchedLogs) => {
    const todayStr = getAlgiersDateString(new Date());

    // Determine the validation date (start of official tracking)
    let validationDateStr = null;
    if (employee?.validated_at) {
      validationDateStr = getAlgiersDateString(new Date(employee.validated_at));
    } else if (employee?.created_at) {
      validationDateStr = getAlgiersDateString(new Date(employee.created_at));
    } else if (fetchedLogs.length > 0) {
      const earliest = fetchedLogs.reduce((min, l) => l.scan_time < min ? l.scan_time : min, fetchedLogs[0].scan_time);
      validationDateStr = getAlgiersDateString(new Date(earliest));
    }

    // 1. Build list of all dates between startDate and endDate
    const dateList = [];
    let curr = new Date(`${startDate}T12:00:00Z`);
    const end = new Date(`${endDate}T12:00:00Z`);

    while (curr <= end) {
      dateList.push(curr.toISOString().split('T')[0]);
      curr.setDate(curr.getDate() + 1);
    }

    // Sort descending (most recent day at the top)
    dateList.sort((a, b) => b.localeCompare(a));

    let sumWork = 0;
    let sumPause = 0;
    let sumAbsent = 0;

    const processed = dateList.map((dateStr) => {
      // Find logs for this day in Africa/Algiers
      const dayLogs = fetchedLogs.filter((log) => {
        return getAlgiersDateString(new Date(log.scan_time)) === dateStr;
      });

      // If 0 scans -> Check why before counting as Absent!
      if (dayLogs.length === 0) {
        // 1. If date is in the future relative to today, do not mark as absent
        if (dateStr > todayStr) {
          return {
            dateStr,
            isAbsent: false,
            isFuture: true,
            workMins: 0,
            pauseMins: 0,
            segments: [],
            logs: []
          };
        }

        // 2. If this date is BEFORE the employee was validated (`dateStr < validationDateStr`), OR account is pending
        if ((validationDateStr && dateStr < validationDateStr) || employee?.status === 'pending') {
          return {
            dateStr,
            isAbsent: false,
            isBeforeValidation: true,
            workMins: 0,
            pauseMins: 0,
            segments: [],
            logs: []
          };
        }

        // 3. If this date is a FRIDAY (day 5), do not mark as absent
        const dayOfWeek = new Date(dateStr).getUTCDay();
        if (dayOfWeek === 5) {
          return {
            dateStr,
            isAbsent: false,
            isWeekend: true,
            workMins: 0,
            pauseMins: 0,
            segments: [],
            logs: []
          };
        }

        sumAbsent += 1;
        return {
          dateStr,
          isAbsent: true,
          workMins: 0,
          pauseMins: 0,
          segments: [],
          logs: []
        };
      }

      // If there are scans, let's pair them into Work (Green) and Pause (Yellow) segments!
      let workMins = 0;
      let pauseMins = 0;
      const segments = [];

      for (let i = 0; i < dayLogs.length; i++) {
        const currentLog = dayLogs[i];
        const nextLog = dayLogs[i + 1]; // could be undefined

        const startMin = getMinuteOfDay(currentLog.scan_time);

        if ((currentLog.action_type || '').toLowerCase() === 'check_in') {
          // Work period starts at CHECK_IN
          let endMin;
          if (nextLog) {
            endMin = getMinuteOfDay(nextLog.scan_time);
          } else {
            // No next log! If today, work continues until current time. If past day, assume up to 8 hours or end of day
            if (dateStr === todayStr) {
              endMin = Math.min(1440, getMinuteOfDay(new Date().toISOString()));
            } else {
              // Capped at +8h (480 mins) or 17:00 if they forgot to scan out
              endMin = Math.min(1440, startMin + 480);
            }
          }

          const duration = Math.max(0, endMin - startMin);
          workMins += duration;
          segments.push({
            type: 'work',
            startMin,
            endMin,
            duration,
            label: `Travail (${formatTimeFromMinute(startMin)} - ${formatTimeFromMinute(endMin)})`
          });
        } else if ((currentLog.action_type || '').toLowerCase() === 'check_out') {
          // Pause period only exists if there IS a subsequent CHECK_IN on the same day!
          if (nextLog && (nextLog.action_type || '').toLowerCase() === 'check_in') {
            const endMin = getMinuteOfDay(nextLog.scan_time);
            const duration = Math.max(0, endMin - startMin);
            pauseMins += duration;
            segments.push({
              type: 'pause',
              startMin,
              endMin,
              duration,
              label: `Pause (${formatTimeFromMinute(startMin)} - ${formatTimeFromMinute(endMin)})`
            });
          }
          // If no nextLog or nextLog is not CHECK_IN, this is the final exit (end of shift -> neutral gray, not pause)
        }
      }

      sumWork += workMins;
      sumPause += pauseMins;

      return {
        dateStr,
        isAbsent: false,
        workMins,
        pauseMins,
        segments,
        logs: dayLogs
      };
    });

    setDaysData(processed);
    setTotalWorkMins(sumWork);
    setTotalPauseMins(sumPause);
    setTotalAbsentDays(sumAbsent);
  };

  // Format total minutes to XXh YYm
  const formatDuration = (totalMins) => {
    const h = Math.floor(totalMins / 60);
    const m = Math.floor(totalMins % 60);
    return `${h}h ${m > 0 ? `${m}m` : ''}`;
  };

  // Format date nicely (ex: Lundi 12/01/2026)
  const formatDateHeader = (dateStr) => {
    const [y, m, d] = dateStr.split('-');
    const dateObj = new Date(y, m - 1, d);
    return dateObj.toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl sm:rounded-3xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden border border-slate-100">
        
        {/* Header */}
        <div className="p-4 sm:p-6 bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white flex items-start sm:items-center justify-between gap-3 border-b border-slate-700/50">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center font-black text-xl sm:text-2xl text-indigo-300 shadow-inner shrink-0">
              {employee.full_name?.charAt(0)?.toUpperCase() || 'E'}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-xl font-black tracking-tight truncate">{employee.full_name}</h2>
                <span className="px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 shrink-0">
                  {employee.role || 'Employé'}
                </span>
              </div>
              <div className="text-[11px] sm:text-xs text-slate-300 font-medium mt-1 flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-3 truncate">
                <span className="truncate">📞 {employee.phone || 'Non renseigné'}</span>
                <span className="hidden sm:inline">•</span>
                <span className="truncate">📧 {employee.email || 'Pas d\'email'}</span>
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center font-bold text-base sm:text-lg transition-all shrink-0 ml-1"
            title="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Date Filter Bar */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-b border-slate-200 space-y-3">
          
          {/* Mode Switcher: Single Day vs Range */}
          <div className="flex items-center justify-between sm:justify-start gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl shadow-inner w-full sm:w-auto">
              <button
                onClick={() => {
                  setFilterMode('single');
                  setStartDate(singleDate);
                  setEndDate(singleDate);
                }}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  filterMode === 'single' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                📌 Jour unique
              </button>
              <button
                onClick={() => {
                  setFilterMode('range');
                  setEndDate(todayStr);
                  setStartDate(getPastDateStr(6));
                }}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 ${
                  filterMode === 'range' ? 'bg-white text-indigo-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                🗓️ Période
              </button>
            </div>
          </div>

          {/* Controls based on mode */}
          {filterMode === 'single' ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-slate-700 shrink-0">
                  📅 Choisir un jour :
                </span>
                <input
                  type="date"
                  value={singleDate}
                  max={todayStr}
                  onChange={(e) => {
                    const d = e.target.value;
                    if (d <= todayStr) {
                      setSingleDate(d);
                      setStartDate(d);
                      setEndDate(d);
                    }
                  }}
                  className="bg-white border-2 border-indigo-500 text-indigo-950 rounded-xl px-2.5 py-1.5 text-xs font-bold shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 min-w-0"
                />
              </div>
              <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                <button
                  onClick={() => {
                    setSingleDate(todayStr);
                    setStartDate(todayStr);
                    setEndDate(todayStr);
                  }}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all shadow-sm border text-center ${
                    singleDate === todayStr ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  🟢 Aujourd'hui
                </button>
                <button
                  onClick={() => {
                    const yest = getPastDateStr(1);
                    setSingleDate(yest);
                    setStartDate(yest);
                    setEndDate(yest);
                  }}
                  className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all shadow-sm border text-center ${
                    singleDate === getPastDateStr(1) ? 'bg-amber-500 text-white border-amber-600' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  🟡 Hier
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 w-full">
              <div className="flex items-center justify-between gap-2 w-full">
                <span className="text-xs font-extrabold text-slate-600 shrink-0">
                  📅 Du :
                </span>
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(e) => {
                    const d = e.target.value;
                    setStartDate(d);
                    if (d > endDate) setEndDate(d);
                  }}
                  className="bg-white border border-slate-300 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 min-w-0"
                />
                <span className="text-xs font-extrabold text-slate-400 shrink-0">au :</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  max={todayStr}
                  onChange={(e) => {
                    const d = e.target.value;
                    setEndDate(d);
                    if (d < startDate) setStartDate(d);
                  }}
                  className="bg-white border border-slate-300 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 flex-1 min-w-0"
                />
              </div>
              <div className="grid grid-cols-3 gap-2 w-full sm:w-auto">
                <button
                  onClick={() => applyPreset(7)}
                  className="py-1.5 px-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all shadow-sm text-center"
                >
                  7 Jours
                </button>
                <button
                  onClick={() => applyPreset(14)}
                  className="py-1.5 px-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all shadow-sm text-center"
                >
                  14 Jours
                </button>
                <button
                  onClick={() => applyPreset(30)}
                  className="py-1.5 px-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-all shadow-sm text-center"
                >
                  30 Jours
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content Body: Timeline Strip per Day */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-100/50">
          {loading ? (
            <div className="py-20 text-center">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                Chargement de l'historique et chronologie...
              </p>
            </div>
          ) : daysData.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8">
              <p className="text-sm font-bold text-slate-600">Aucune date sélectionnée ou période invalide.</p>
            </div>
          ) : (
            daysData.map((day) => (
              <div
                key={day.dateStr}
                className={`bg-white rounded-2xl border shadow-sm p-5 transition-all ${
                  day.isAbsent ? 'border-rose-200 bg-rose-50/20' : 'border-slate-200/80 hover:border-slate-300'
                }`}
              >
                {/* Day Header */}
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-800 capitalize">
                      {formatDateHeader(day.dateStr)}
                    </span>
                    {day.dateStr === todayStr && (
                      <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-wider border border-indigo-200">
                        Aujourd'hui
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    {day.isBeforeValidation ? (
                      <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-600 text-xs font-black tracking-wide border border-slate-300 flex items-center gap-1.5 shadow-sm">
                        ⏳ Avant validation du compte
                      </span>
                    ) : day.isFuture ? (
                      <span className="px-3 py-1 rounded-xl bg-slate-100 text-slate-400 text-xs font-bold tracking-wide border border-slate-200 flex items-center gap-1.5 shadow-sm">
                        📅 Date à venir
                      </span>
                    ) : day.isWeekend ? (
                      <span className="px-3 py-1 rounded-xl bg-sky-50 text-sky-700 text-xs font-black tracking-wide border border-sky-200 flex items-center gap-1.5 shadow-sm">
                        🌴 VENDREDI (Repos)
                      </span>
                    ) : day.isAbsent ? (
                      <span className="px-3 py-1 rounded-xl bg-rose-100 text-rose-800 text-xs font-black tracking-wide border border-rose-200 flex items-center gap-1.5 shadow-sm">
                        🔴 ABSENT(E) (Aucun pointage)
                      </span>
                    ) : (
                      <div className="flex items-center gap-2 flex-wrap text-xs font-extrabold">
                        <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          🟢 Travail : <span className="font-mono">{formatDuration(day.workMins)}</span>
                        </span>
                        {day.pauseMins > 0 && (
                          <span className="px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                            🟡 Pause : <span className="font-mono">{formatDuration(day.pauseMins)}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 24h Timeline Bar (Chriit Zamani) */}
                <div className="space-y-1.5 my-4">
                  <div className="relative h-9 w-full bg-slate-100 rounded-xl overflow-hidden border border-slate-200 shadow-inner flex">
                    {day.isBeforeValidation ? (
                      /* Grey Bar for Pre-Validation Day */
                      <div className="w-full h-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-[10px] sm:text-xs tracking-normal sm:tracking-wide px-2 text-center truncate shadow-inner">
                        ⏳ NON COMPTABILISÉ — COMPTE NON ENCORE VALIDÉ À CETTE DATE
                      </div>
                    ) : day.isFuture ? (
                      /* Light Grey Bar for Future Day */
                      <div className="w-full h-full bg-slate-100 flex items-center justify-center text-slate-400 font-medium text-[10px] sm:text-xs tracking-normal px-2 text-center truncate">
                        📅 JOURNÉE À VENIR
                      </div>
                    ) : day.isWeekend ? (
                      /* Sky Blue Bar for Weekend */
                      <div className="w-full h-full bg-gradient-to-r from-sky-400 to-sky-500 flex items-center justify-center text-white font-black text-[10px] sm:text-xs tracking-normal sm:tracking-widest px-2 text-center truncate shadow-sm">
                        🌴 VENDREDI - REPOS
                      </div>
                    ) : day.isAbsent ? (
                      /* Solid Red Bar for Absent Day */
                      <div className="w-full h-full bg-gradient-to-r from-rose-500 to-rose-600 flex items-center justify-center text-white font-black text-[10px] sm:text-xs tracking-normal sm:tracking-widest px-2 text-center truncate shadow-sm">
                        🔴 JOURNÉE D'ABSENCE - AUCUN POINTAGE ENREGISTRÉ
                      </div>
                    ) : (
                      /* Proportional 24h Segments */
                      day.segments.map((seg, idx) => {
                        const leftPct = (seg.startMin / 1440) * 100;
                        const widthPct = (seg.duration / 1440) * 100;
                        return (
                          <div
                            key={idx}
                            style={{ left: `${leftPct}%`, width: `${Math.max(widthPct, 1.5)}%` }}
                            title={seg.label}
                            className={`absolute top-0 bottom-0 flex items-center justify-center text-[10px] font-black tracking-tight overflow-hidden transition-all hover:brightness-110 shadow-sm ${
                              seg.type === 'work'
                                ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-r border-emerald-700/30'
                                : 'bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 border-r border-amber-600/30'
                            }`}
                          >
                            {widthPct > 5 && (seg.type === 'work' ? 'Travail' : 'Pause')}
                          </div>
                        );
                      })
                    )}
                  </div>

                  {/* Axis scale markers */}
                  <div className="flex justify-between text-[10px] font-extrabold text-slate-400 px-1">
                    <span>00:00</span>
                    <span>06:00</span>
                    <span>12:00</span>
                    <span>18:00</span>
                    <span>24:00</span>
                  </div>
                </div>

                {/* Detailed Scan Log List for this day */}
                {!day.isAbsent && day.logs.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-bold text-slate-400 mr-1">Pointages du jour :</span>
                    {day.logs.map((log, index) => (
                      <div
                        key={log.id || index}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 shadow-2xs ${
                          (log.action_type || '').toLowerCase() === 'check_in'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-amber-50 text-amber-800 border-amber-200'
                        }`}
                      >
                        <span>{(log.action_type || '').toLowerCase() === 'check_in' ? '🟢 Entrée' : '🟡 Sortie'}</span>
                        <span className="font-mono font-black">{formatTimeChlef(log.scan_time)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer: Global Totals */}
        <div className="p-4 sm:p-6 bg-slate-900 text-white border-t border-slate-800 space-y-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-slate-400 uppercase tracking-wider">
              📊 Bilan Global de la période sélectionnée :
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
            {/* Total Work Hours */}
            <div className="flex items-center gap-3 p-3.5 bg-emerald-500/20 border border-emerald-400/30 rounded-2xl">
              <span className="text-2xl shrink-0">🟢</span>
              <div>
                <div className="text-[10px] font-extrabold text-emerald-300 uppercase tracking-wider">
                  Total Heures de Travail
                </div>
                <div className="text-base sm:text-lg font-black font-mono text-white">
                  {formatDuration(totalWorkMins)}
                </div>
              </div>
            </div>

            {/* Total Pause Hours */}
            <div className="flex items-center gap-3 p-3.5 bg-amber-500/20 border border-amber-400/30 rounded-2xl">
              <span className="text-2xl shrink-0">🟡</span>
              <div>
                <div className="text-[10px] font-extrabold text-amber-300 uppercase tracking-wider">
                  Total Heures de Pause
                </div>
                <div className="text-base sm:text-lg font-black font-mono text-white">
                  {formatDuration(totalPauseMins)}
                </div>
              </div>
            </div>

            {/* Total Absent Days */}
            <div className="flex items-center gap-3 p-3.5 bg-rose-500/20 border border-rose-400/30 rounded-2xl">
              <span className="text-2xl shrink-0">🔴</span>
              <div>
                <div className="text-[10px] font-extrabold text-rose-300 uppercase tracking-wider">
                  Total Absences
                </div>
                <div className="text-base sm:text-lg font-black font-mono text-white">
                  {totalAbsentDays} {totalAbsentDays > 1 ? 'jours' : 'jour'}
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
