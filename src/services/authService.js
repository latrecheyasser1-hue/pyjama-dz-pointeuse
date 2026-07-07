// ============================================================================
// Pyjama DZ Pointeuse: Authentication & Demo Helper Service
// ============================================================================
import { supabase } from '../lib/supabase';

/**
 * Login with Email and Password
 */
export async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw new Error(error.message === 'Invalid login credentials' 
      ? 'Email ou mot de passe incorrect.' 
      : error.message);
  }

  // Fetch profile
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, full_name, role, status, workplace_id, bound_device_id, workplaces(name)')
    .eq('id', data.user.id)
    .single();

  if (profErr || !profile) {
    // Fallback if profile doesn't exist yet
    return {
      user: data.user,
      profile: {
        id: data.user.id,
        full_name: data.user.email.split('@')[0],
        role: 'employee',
        status: 'active'
      }
    };
  }

  return { user: data.user, profile };
}

/**
 * Logout
 */
export async function logoutUser() {
  await supabase.auth.signOut();
  localStorage.removeItem('pyjama_active_tab');
}

/**
 * Get Current Active Session & Profile
 */
export async function getCurrentSessionAndProfile() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, status, workplace_id, bound_device_id, workplaces(name)')
    .eq('id', session.user.id)
    .single();

  return {
    session,
    user: session.user,
    profile: profile || {
      id: session.user.id,
      full_name: session.user.email.split('@')[0],
      role: 'employee',
      status: 'active'
    }
  };
}

/**
 * Seeding Demo Accounts (Admin & Employee) for Instant Testing!
 * This uses standard Supabase Auth Sign Up.
 */
export async function seedDemoAccounts() {
  // 1. Fetch default workplace
  const { data: wp } = await supabase
    .from('workplaces')
    .select('id')
    .eq('name', 'Siège Principal Alger - Pyjama DZ')
    .single();

  const workplaceId = wp ? wp.id : null;

  // 2. Create Demo Employee: yasser@pyjamadz.com / dz2026
  let employeeResult = 'Compte employé déjà existant';
  try {
    const { data: empData, error: empErr } = await supabase.auth.signUp({
      email: 'yasser@pyjamadz.com',
      password: 'pyjamadz2026',
      options: {
        data: { full_name: 'Yasser Latreche' }
      }
    });

    if (!empErr && empData?.user) {
      // Ensure profile exists and is active
      await supabase.from('profiles').upsert({
        id: empData.user.id,
        workplace_id: workplaceId,
        full_name: 'Yasser Latreche',
        email: 'yasser@pyjamadz.com',
        phone: '0550123456',
        role: 'employee',
        status: 'active'
      });
      employeeResult = 'Employé créé avec succès !';
    }
  } catch (e) {
    console.log('Employee seed info:', e);
  }

  // 3. Create Demo Admin: admin@pyjamadz.com / dz2026
  let adminResult = 'Compte admin déjà existant';
  try {
    const { data: admData, error: admErr } = await supabase.auth.signUp({
      email: 'admin@pyjamadz.com',
      password: 'pyjamadz2026',
      options: {
        data: { full_name: 'Directeur Pyjama DZ' }
      }
    });

    if (!admErr && admData?.user) {
      await supabase.from('profiles').upsert({
        id: admData.user.id,
        workplace_id: workplaceId,
        full_name: 'Directeur Pyjama DZ',
        email: 'admin@pyjamadz.com',
        phone: '0660998877',
        role: 'admin',
        status: 'active'
      });
      adminResult = 'Admin créé avec succès !';
    }
  } catch (e) {
    console.log('Admin seed info:', e);
  }

  return {
    employee: { email: 'yasser@pyjamadz.com', pass: 'pyjamadz2026', status: employeeResult },
    admin: { email: 'admin@pyjamadz.com', pass: 'pyjamadz2026', status: adminResult }
  };
}
