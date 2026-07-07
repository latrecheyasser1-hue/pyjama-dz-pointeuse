// ============================================================================
// Pyjama DZ Pointeuse: Authentication & Demo Helper Service
// ============================================================================
import { supabase } from '../lib/supabase';

/**
 * Admin Login with Custom Username & Password
 * Username: username321 / Password: 765483cr654
 */
export async function loginAdminUsername(username, password) {
  if (username !== 'username321' || password !== '765483cr654') {
    throw new Error("Nom d'utilisateur ou mot de passe administrateur incorrect.");
  }

  const adminEmail = 'admin_user321@pyjamadz.com';
  const adminPass = 'pyjamadz_admin_765483cr654_secure';

  // 1. Try signing in
  let { data, error } = await supabase.auth.signInWithPassword({
    email: adminEmail,
    password: adminPass
  });

  // 2. If login fails, try to create/sign up the admin account
  if (error || !data?.user) {
    // Also try the fallback demo email just in case
    let fallbackRes = await supabase.auth.signInWithPassword({
      email: 'admin@pyjamadz.com',
      password: 'pyjamadz2026'
    });

    if (!fallbackRes.error && fallbackRes.data?.user) {
      data = fallbackRes.data;
      error = null;
    } else {
      // Create the admin account
      const signUpRes = await supabase.auth.signUp({
        email: adminEmail,
        password: adminPass,
        options: { data: { full_name: 'Directeur Pyjama DZ' } }
      });

      if (signUpRes.error) {
        if (signUpRes.error.message.includes('already registered')) {
          // If already registered but login failed, password might be wrong or email unconfirmed
          throw new Error("Compte admin déjà existant dans Supabase mais mot de passe ou email non confirmé. Veuillez désactiver 'Confirm email' dans Supabase (Authentication -> Providers -> Email -> Confirm email: OFF).");
        }
        throw new Error(`Erreur Supabase lors de la création admin : ${signUpRes.error.message}`);
      }

      // Try signing in again after signUp
      const retryRes = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: adminPass
      });

      data = retryRes.data;
      error = retryRes.error;
    }
  }

  if (error || !data?.user) {
    const errMsg = error?.message || 'Erreur inconnue';
    if (errMsg.toLowerCase().includes('email not confirmed') || errMsg.toLowerCase().includes('not confirmed')) {
      throw new Error("⚠️ ACTION REQUISE DANS SUPABASE : Vous devez désactiver la confirmation d'email ! Allez dans votre tableau de bord Supabase -> Authentication -> Providers -> Email -> désactivez 'Confirm email' (OFF) et sauvegardez.");
    }
    throw new Error(`Erreur de connexion Supabase (${errMsg}). Veuillez vérifier votre projet Supabase ou désactiver 'Confirm email' dans Authentication -> Providers -> Email.`);
  }

  // Ensure admin profile exists in profiles table and has admin role
  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, full_name, role, status, workplace_id, bound_device_id, workplaces(name)')
    .eq('id', data.user.id)
    .single();

  if (!profile || profErr) {
    // If profile doesn't exist yet in table, insert it!
    const newAdminProfile = {
      id: data.user.id,
      full_name: 'Directeur Pyjama DZ',
      email: data.user.email,
      phone: '0660998877',
      role: 'admin',
      status: 'active'
    };
    await supabase.from('profiles').upsert(newAdminProfile);
    return { user: data.user, profile: newAdminProfile };
  }

  // Make sure role is admin
  if (profile.role !== 'admin' || profile.status !== 'active') {
    await supabase.from('profiles').update({ role: 'admin', status: 'active' }).eq('id', data.user.id);
    profile.role = 'admin';
    profile.status = 'active';
  }

  return {
    user: data.user,
    profile
  };
}

/**
 * Employee Login & Registration by Phone Number & Name ONLY
 */
export async function loginOrRegisterEmployeeByPhone(phone, fullName) {
  if (!phone || phone.trim().length < 8) {
    throw new Error('Veuillez entrer un numéro de téléphone valide (ex: 0550123456).');
  }
  if (!fullName || fullName.trim().length < 2) {
    throw new Error('Veuillez entrer votre nom et prénom.');
  }

  const cleanPhone = phone.trim().replace(/\D/g, '');
  const syntheticEmail = `${cleanPhone}@pyjamadz.employee`;
  const syntheticPassword = `phone_auth_${cleanPhone}_dz_secure_2026`;

  // 1. Try signing in first (if employee already registered)
  let { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password: syntheticPassword
  });

  if (!signInErr && signInData?.user) {
    // Fetch existing profile
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id, full_name, role, status, phone, workplace_id, bound_device_id, workplaces(name)')
      .eq('id', signInData.user.id)
      .single();

    return {
      user: signInData.user,
      profile: existingProfile || {
        id: signInData.user.id,
        full_name: fullName.trim(),
        phone: cleanPhone,
        role: 'employee',
        status: 'pending'
      }
    };
  }

  // 2. If login failed, register new employee
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: syntheticEmail,
    password: syntheticPassword,
    options: {
      data: { full_name: fullName.trim(), phone: cleanPhone }
    }
  });

  if (signUpErr) {
    throw new Error(signUpErr.message === 'User already registered'
      ? 'Ce numéro de téléphone est déjà inscrit ou le mot de passe interne ne correspond pas.'
      : `Erreur d'inscription : ${signUpErr.message}`);
  }

  if (!signUpData?.user) {
    throw new Error('Impossible de créer le compte employé.');
  }

  // Fetch default workplace ID
  const { data: wp } = await supabase
    .from('workplaces')
    .select('id')
    .limit(1)
    .single();
  const workplaceId = wp ? wp.id : null;

  // Create new profile with status = 'pending' (requires admin validation!)
  const newProfileData = {
    id: signUpData.user.id,
    workplace_id: workplaceId,
    full_name: fullName.trim(),
    email: syntheticEmail,
    phone: cleanPhone,
    role: 'employee',
    status: 'pending'
  };

  await supabase.from('profiles').upsert(newProfileData);

  return {
    user: signUpData.user,
    profile: newProfileData
  };
}

/**
 * Standard Login with Email and Password (fallback / demo)
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, status, workplace_id, bound_device_id, workplaces(name)')
    .eq('id', data.user.id)
    .single();

  return { user: data.user, profile: profile || { id: data.user.id, full_name: data.user.email.split('@')[0], role: 'employee', status: 'active' } };
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
    .select('id, full_name, role, status, phone, workplace_id, bound_device_id, workplaces(name)')
    .eq('id', session.user.id)
    .single();

  return {
    session,
    user: session.user,
    profile: profile || {
      id: session.user.id,
      full_name: session.user.email.split('@')[0],
      role: 'employee',
      status: 'pending'
    }
  };
}

/**
 * Seeding Demo Accounts (Admin & Employee)
 */
export async function seedDemoAccounts() {
  const { data: wp } = await supabase
    .from('workplaces')
    .select('id')
    .eq('name', 'Siège Principal Alger - Pyjama DZ')
    .single();
  const workplaceId = wp ? wp.id : null;

  // Demo Employee
  try {
    const { data: empData, error: empErr } = await supabase.auth.signUp({
      email: 'yasser@pyjamadz.com',
      password: 'pyjamadz2026',
      options: { data: { full_name: 'Yasser Latreche' } }
    });
    if (!empErr && empData?.user) {
      await supabase.from('profiles').upsert({
        id: empData.user.id,
        workplace_id: workplaceId,
        full_name: 'Yasser Latreche',
        email: 'yasser@pyjamadz.com',
        phone: '0550123456',
        role: 'employee',
        status: 'active'
      });
    }
  } catch (e) { console.log(e); }

  // Demo Admin
  try {
    const { data: admData, error: admErr } = await supabase.auth.signUp({
      email: 'admin@pyjamadz.com',
      password: 'pyjamadz2026',
      options: { data: { full_name: 'Directeur Pyjama DZ' } }
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
    }
  } catch (e) { console.log(e); }

  return {
    employee: { email: 'yasser@pyjamadz.com', pass: 'pyjamadz2026', status: 'OK' },
    admin: { email: 'admin@pyjamadz.com', pass: 'pyjamadz2026', status: 'OK' }
  };
}
