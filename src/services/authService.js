// ============================================================================
// Pyjama DZ Pointeuse: Authentication & Demo Helper Service
// ============================================================================
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import { createClient } from '@supabase/supabase-js';

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
    .select('*, workplaces(name)')
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
    return { user: data.user, profile: await ensureWorkplaceAssigned(newAdminProfile, data.user.id) };
  }

  // Make sure role is admin
  if (profile.role !== 'admin' || profile.status !== 'active') {
    await supabase.from('profiles').update({ role: 'admin', status: 'active' }).eq('id', data.user.id);
    profile.role = 'admin';
    profile.status = 'active';
  }

  return {
    user: data.user,
    profile: await ensureWorkplaceAssigned(profile, data.user.id)
  };
}

function normalizePhone(phone) {
  if (!phone) return '';
  let clean = phone.trim().replace(/\D/g, '');
  if (clean.startsWith('213') && clean.length === 12) {
    clean = '0' + clean.slice(3);
  } else if (clean.length === 9 && ['5', '6', '7'].includes(clean[0])) {
    clean = '0' + clean;
  }
  return clean;
}

/**
 * Employee Registration by Phone Number & Name ONLY (Strictly New Accounts)
 */
export async function registerEmployeeByPhone(phone, fullName) {
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone || cleanPhone.length < 8) {
    throw new Error('Veuillez entrer un numéro de téléphone valide (ex: 0550123456).');
  }
  if (!fullName || fullName.trim().length < 2) {
    throw new Error('Veuillez entrer votre nom et prénom.');
  }

  const syntheticEmail = `${cleanPhone}@pyjamadz.employee`;
  const syntheticPassword = `phone_auth_${cleanPhone}_dz_secure_2026`;

  // 1. STRICT CHECK: Check if phone already exists in profiles table
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, full_name, phone')
    .eq('phone', cleanPhone)
    .maybeSingle();

  if (existingProfile) {
    throw new Error(`❌ Ce numéro de téléphone (${cleanPhone}) est déjà inscrit au nom de "${existingProfile.full_name}" ! Un numéro ne peut pas être utilisé deux fois.`);
  }

  // 2. STRICT CHECK: Check if auth account already exists by trying to sign in
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password: syntheticPassword
  });

  if (!signInErr && signInData?.user) {
    await supabase.auth.signOut();
    throw new Error(`❌ Ce numéro de téléphone (${cleanPhone}) est déjà inscrit ! Si vous avez déjà un compte, basculez vers l'onglet "Connexion".`);
  }

  // 3. Register new employee
  const { data: signUpData, error: signUpErr } = await supabase.auth.signUp({
    email: syntheticEmail,
    password: syntheticPassword,
    options: {
      data: { full_name: fullName.trim(), phone: cleanPhone }
    }
  });

  if (signUpErr) {
    throw new Error(signUpErr.message === 'User already registered'
      ? `❌ Ce numéro de téléphone (${cleanPhone}) est déjà inscrit dans le système !`
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

  // Create new profile with status = 'pending'
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
 * Employee Login by Phone Number ONLY (For Existing Accounts)
 */
export async function loginEmployeeByPhone(phone) {
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone || cleanPhone.length < 8) {
    throw new Error('Veuillez entrer un numéro de téléphone valide (ex: 0550123456).');
  }

  const syntheticEmail = `${cleanPhone}@pyjamadz.employee`;
  const syntheticPassword = `phone_auth_${cleanPhone}_dz_secure_2026`;

  // Try signing in
  const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
    email: syntheticEmail,
    password: syntheticPassword
  });

  if (signInErr || !signInData?.user) {
    throw new Error(`❌ Aucun compte trouvé avec le numéro (${cleanPhone}). Si vous êtes nouveau, basculez vers l'onglet "Inscription".`);
  }

  // Fetch existing profile
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('*, workplaces(name)')
    .eq('id', signInData.user.id)
    .single();

  const finalProfile = await ensureWorkplaceAssigned(existingProfile || {
    id: signInData.user.id,
    full_name: 'Employé',
    phone: cleanPhone,
    role: 'employee',
    status: 'pending'
  }, signInData.user.id);

  return {
    user: signInData.user,
    profile: finalProfile
  };
}

/**
 * Backward compatibility wrapper
 */
export async function loginOrRegisterEmployeeByPhone(phone, fullName) {
  try {
    return await loginEmployeeByPhone(phone);
  } catch (e) {
    if (fullName) {
      return await registerEmployeeByPhone(phone, fullName);
    }
    throw e;
  }
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

async function ensureWorkplaceAssigned(profile, userId) {
  if (!profile) return profile;
  if (!profile.workplace_id) {
    const { data: defaultWps } = await supabase
      .from('workplaces')
      .select('id, name')
      .limit(1);
    const defaultWp = defaultWps && defaultWps.length > 0 ? defaultWps[0] : null;
    if (defaultWp) {
      profile.workplace_id = defaultWp.id;
      profile.workplaces = { name: defaultWp.name };
      await supabase.from('profiles').update({ workplace_id: defaultWp.id }).eq('id', userId || profile.id);
    }
  }
  return profile;
}

/**
 * Get Current Active Session & Profile
 */
export async function getCurrentSessionAndProfile() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, workplaces(name)')
    .eq('id', session.user.id)
    .single();

  const finalProfile = await ensureWorkplaceAssigned(profile || {
    id: session.user.id,
    full_name: session.user.email.split('@')[0],
    role: 'employee',
    status: 'pending'
  }, session.user.id);

  return {
    session,
    user: session.user,
    profile: finalProfile
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

/**
 * Create an offline employee (Face Recognition) without affecting Admin's active session
 */
export async function createOfflineEmployee(fullName, phone) {
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone || cleanPhone.length < 8) {
    throw new Error('Veuillez entrer un numéro de téléphone valide.');
  }
  if (!fullName || fullName.trim().length < 2) {
    throw new Error('Veuillez entrer le nom complet.');
  }

  const syntheticEmail = `${cleanPhone}@pyjamadz.employee`;
  const syntheticPassword = `phone_auth_${cleanPhone}_dz_secure_2026`;

  // 1. Check if phone already exists
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id, full_name, phone')
    .eq('phone', cleanPhone)
    .maybeSingle();

  if (existingProfile) {
    throw new Error(`❌ Ce numéro de téléphone (${cleanPhone}) est déjà inscrit au nom de "${existingProfile.full_name}" !`);
  }

  // 2. Create a Temp Client (No session persistence)
  const tempClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  // 3. Register user using tempClient
  const { data: signUpData, error: signUpErr } = await tempClient.auth.signUp({
    email: syntheticEmail,
    password: syntheticPassword,
    options: {
      data: { full_name: fullName.trim(), phone: cleanPhone }
    }
  });

  if (signUpErr) {
    throw new Error(`Erreur d'inscription : ${signUpErr.message}`);
  }

  if (!signUpData?.user) {
    throw new Error('Impossible de créer le compte employé hors-ligne.');
  }

  // 4. Fetch default workplace
  const { data: wp } = await supabase
    .from('workplaces')
    .select('id')
    .limit(1)
    .single();
  const workplaceId = wp ? wp.id : null;

  // 5. Insert profile with Active status directly!
  const newProfileData = {
    id: signUpData.user.id,
    workplace_id: workplaceId,
    full_name: fullName.trim(),
    email: syntheticEmail,
    phone: cleanPhone,
    role: 'employee',
    status: 'active'
  };

  // We can use the main `supabase` client because the Admin has permission to insert/update profiles
  const { error: insertErr } = await supabase.from('profiles').upsert(newProfileData);
  if (insertErr) {
      throw new Error(`Erreur de profil: ${insertErr.message}`);
  }

  return {
    user: signUpData.user,
    profile: newProfileData
  };
}
