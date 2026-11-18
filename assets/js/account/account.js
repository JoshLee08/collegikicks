(async () => {
  'use strict';
  const root = document.getElementById('account-content');
  const status = document.getElementById('account-status');
  const config = window.KYORUGI_ACCOUNT_CONFIG;
  const say = (text) => {
    status.textContent = text;
  };
  if (!config?.url || !config.publishableKey) {
    say('Account sign-in is not configured yet. You can continue using the planner as a guest.');
    return;
  }
  const account = window.KyorugiAccount;
  try {
    await account.ready;
  } catch {
    say('Unable to load your account. Check your connection and reload.');
    return;
  }
  const client = account.client;
  if (new URLSearchParams(location.hash.slice(1)).has('error'))
    say('Sign-in was canceled or the link expired. Please try again.');
  // Resolve from the HTML page to preserve the GitHub Pages repository subpath.
  const callback = new URL('profile.html', location.href).href;
  const { data, error } = await client.auth.getSession();
  if (error) {
    say('Your sign-in link could not be verified. Request a new link.');
  }
  if (!data.session) {
    document.querySelector('h1').textContent = 'Your Taekwondo account';
    document.querySelector('.account > h1 + p').textContent =
      'Create an account or sign in to save your profile and training plan.';
    root.innerHTML =
      '<button id="google">Continue with Google</button><form id="email-form"><label for="email">Email address</label><input id="email" type="email" autocomplete="email" required><button>Send sign-in link</button></form><p>Open the link on the device where you want to sign in. Already have an account? The same link signs you in.</p>';
    document.getElementById('google').onclick = async () => {
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callback }
      });
      if (error) say(error.message);
    };
    document.getElementById('email-form').onsubmit = async (event) => {
      event.preventDefault();
      const button = event.target.querySelector('button');
      button.disabled = true;
      say('Sending…');
      try {
        const { error } = await client.auth.signInWithOtp({
          email: document.getElementById('email').value,
          options: { emailRedirectTo: callback }
        });
        say(
          error
            ? error.message
            : 'Check your email for your sign-in link. You can request another if it expires.'
        );
        button.textContent = 'Resend sign-in link';
      } catch {
        say('Could not send the link. Check your connection and retry.');
      } finally {
        button.disabled = false;
      }
    };
    return;
  }
  const user = data.session.user;
  try {
    const response = await fetch('club-calendar.json');
    if (response.ok) publishedClubs = (await response.json()).clubs || {};
  } catch {}
  let saved = account.record.profile;
  const draftKey = 'kyorugi-onboarding-' + user.id;
  if (!saved.onboardingComplete) {
    try {
      saved = { ...saved, ...JSON.parse(sessionStorage.getItem(draftKey) || '{}') };
    } catch {}
  }
  let planner = account.record.planner;
  const fields = [
    ['displayName', 'Display name', 'text'],
    [
      'school',
      'School or club',
      'select',
      [
        'Add later',
        'UC Berkeley',
        'Fresno State',
        'Menlo College',
        'USC',
        'UCI',
        'UCSD',
        'UC Davis',
        'UCLA',
        'Other',
        'Independent athlete'
      ]
    ],
    ['customSchool', 'Other school name', 'text'],
    [
      'belt',
      'Belt level',
      'select',
      ['Not specified', 'White', 'Yellow', 'Green', 'Blue', 'Red', 'Black', 'Other']
    ],
    ['rankLabel', 'Stripe or custom rank', 'text'],
    ['dan', 'Dan (black belts, optional)', 'number'],
    ['years', 'Years training (optional)', 'number'],
    [
      'experience',
      'Tournament experience',
      'select',
      ['Not specified', 'None yet', '1–2 events', '3–5 events', '6+ events']
    ],
    [
      'level',
      'Competition level',
      'select',
      ['Not specified', 'Collegiate/local', 'Regional', 'National', 'International']
    ],
    ['discipline', 'Training discipline', 'select', ['Sparring', 'Recognized poomsae', 'Both']],
    [
      'priority',
      'Mixed discipline priority',
      'select',
      ['Balanced', 'Sparring priority', 'Poomsae priority']
    ],
    ['forms', 'Coach-assigned forms', 'text'],
    ['goals', 'Goals (choose up to three)', 'goals'],
    ['days', 'Available weekdays', 'days'],
    ['sessions', 'Maximum solo sessions per week', 'select', ['0', '1', '2', '3', '4']],
    ['duration', 'Maximum session length (minutes)', 'select', ['20', '30', '45', '60']],
    ['timezone', 'Timezone', 'text']
  ];
  root.innerHTML =
    '<form id="profile-form"><h2>Athlete details</h2><p>Your profile is private. Rank systems vary by school. Solo sessions are additional to team practice.</p><div id="fields"></div><button>Save profile</button><button type="button" id="cancel">Cancel</button></form><section><h2>Account</h2><p id="identity"></p><button id="export">Export profile</button><button id="signout">Sign out</button></section>';
  document.getElementById('identity').textContent = user.email;
  const container = document.getElementById('fields');
  for (const [key, label, type, options] of fields) {
    const l = document.createElement('label');
    l.htmlFor = key;
    l.textContent = label;
    container.append(l);
    const input = document.createElement(type === 'select' ? 'select' : 'input');
    input.id = key;
    input.name = key;
    if (options)
      for (const value of options) {
        const o = document.createElement('option');
        o.value = value;
        o.textContent = value;
        input.append(o);
      }
    else input.type = type;
    if (type === 'goals' || type === 'days') {
      input.remove();
      const values =
        type === 'goals'
          ? [
              'Tournament preparation',
              'Conditioning',
              'Strength',
              'Technique',
              'Mobility/balance',
              'Consistency'
            ]
          : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const group = document.createElement('fieldset');
      group.id = key;
      const legend = document.createElement('legend');
      legend.textContent = label;
      group.append(legend);
      for (const value of values) {
        const wrap = document.createElement('label');
        const check = document.createElement('input');
        check.type = 'checkbox';
        check.name = key;
        check.value = value;
        wrap.append(check, document.createTextNode(value));
        group.append(wrap);
      }
      container.append(group);
      l.remove();
      continue;
    }
    if (type === 'text') input.maxLength = 200;
    if (type === 'number') {
      input.min = '0';
      input.max = key === 'dan' ? '9' : '100';
    }
    if (key === 'displayName') input.required = true;
    container.append(input);
  }
  function restore() {
    for (const [key, typeLabel, type] of fields) {
      if (type === 'goals' || type === 'days') {
        for (const input of document.querySelectorAll(`[name=${key}]`))
          input.checked = (
            saved[key] || (key === 'days' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : [])
          ).includes(input.value);
        continue;
      }
      document.getElementById(key).value =
        saved[key] ??
        {
          sessions: '2',
          duration: '30',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        }[key] ??
        document.getElementById(key).options?.[0]?.value ??
        '';
    }
    dirty = false;
    conditional();
  }
  function conditional() {
    for (const [key, visible] of [
      ['customSchool', document.getElementById('school').value === 'Other'],
      ['dan', document.getElementById('belt').value === 'Black'],
      ['priority', document.getElementById('discipline').value === 'Both'],
      ['forms', document.getElementById('discipline').value !== 'Sparring']
    ]) {
      document.getElementById(key).hidden = !visible;
      document.querySelector(`label[for=${key}]`).hidden = !visible;
    }
  }
  let dirty = false;
  restore();
  document.getElementById('profile-form').oninput = () => {
    dirty = true;
    conditional();
    if (!saved.onboardingComplete) {
      const f = new FormData(document.getElementById('profile-form'));
      sessionStorage.setItem(
        draftKey,
        JSON.stringify({
          ...Object.fromEntries(f),
          goals: f.getAll('goals'),
          days: f.getAll('days')
        })
      );
    }
    say('Unsaved changes');
  };
  window.addEventListener('beforeunload', (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  document.getElementById('cancel').onclick = () => {
    restore();
    say('Changes canceled.');
  };
  document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const profile = Object.fromEntries(formData);
    profile.goals = formData.getAll('goals');
    profile.days = formData.getAll('days');
    if (profile.goals.length > 3) {
      say('Choose up to three goals.');
      return;
    }
    if (!profile.displayName.trim()) {
      document.getElementById('displayName').focus();
      return;
    }
    try {
      new Intl.DateTimeFormat('en', { timeZone: profile.timezone });
    } catch {
      say('Enter a valid timezone, such as America/Los_Angeles.');
      document.getElementById('timezone').focus();
      return;
    }
    say('Saving…');
    const button = e.target.querySelector('button');
    button.disabled = true;
    try {
      profile.onboardingComplete = true;
      if (!(await preview(profile))) return;
      const firstSetup = !account.record.profile.onboardingComplete;
      await account.save(profile, planner);
      saved = profile;
      dirty = false;
      sessionStorage.removeItem(draftKey);
      say('Profile and training preferences saved.');
      if (firstSetup) location.href = './';
    } catch (error) {
      say(
        'Profile not saved. ' +
          error.message +
          ' Your edits are still here; retry or reload to fetch the latest version.'
      );
    } finally {
      button.disabled = false;
    }
  };
  document.getElementById('signout').onclick = async () => {
    if (dirty && !confirm('Discard unsaved changes and sign out?')) return;
    const { error } = await client.auth.signOut();
    if (error) {
      say(error.message);
      return;
    }
    dirty = false;
    sessionStorage.removeItem(draftKey);
    location.href = 'login.html';
  };
  document.getElementById('export').onclick = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, profile: saved, planner }, null, 2)], {
        type: 'application/json'
      })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'collegikicks-profile.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  async function preview(profile) {
    const oldState = {
      tournaments: [],
      tournament: '',
      weeks: {},
      teams: {},
      club: 'custom',
      ...planner,
      profile: saved
    };
    const nextState = { ...oldState, profile };
    const clubs = {
      'UC Berkeley': 'berkeley',
      'Fresno State': 'fresno',
      'Menlo College': 'menlo',
      USC: 'usc',
      UCI: 'uci',
      UCSD: 'ucsd',
      'UC Davis': 'ucd',
      UCLA: 'ucla'
    };
    nextState.club = clubs[profile.school] || 'custom';
    const start = monday(new Date());
    const before = planForWeek(start, oldState).plan,
      after = planForWeek(start, nextState).plan;
    const lines = after.map(
      (day, i) => `${days[i]}: ${before[i].title} → ${day.title} (${day.time})`
    );
    const dialog = document.createElement('dialog');
    const heading = document.createElement('h2');
    heading.textContent = 'Review this week’s plan';
    const text = document.createElement('pre');
    text.textContent = lines.join('\n');
    dialog.append(heading, text);
    return new Promise((resolve) => {
      let done = false;
      function finish(result) {
        if (done) return;
        done = true;
        dialog.close();
        dialog.remove();
        if (result) planner = { ...planner, club: nextState.club };
        resolve(result);
      }
      for (const [label, result] of [
        ['Apply profile & plan', true],
        ['Keep editing', false]
      ]) {
        const button = document.createElement('button');
        button.textContent = label;
        button.onclick = () => finish(result);
        dialog.append(button);
      }
      dialog.oncancel = (e) => {
        e.preventDefault();
        finish(false);
      };
      document.body.append(dialog);
      dialog.showModal();
    });
  }
  const summary = document.createElement('p');
  summary.textContent = saved.displayName
    ? `${saved.displayName} · ${saved.school || 'School optional'} · ${saved.belt || 'Rank optional'} · ${saved.discipline || 'Choose a discipline'}`
    : 'Complete your athlete profile. Optional details can be added later.';
  root.prepend(summary);
  const link = document.createElement('p');
  link.innerHTML = '<a href="./">Edit practice times and class schedule →</a>';
  root.append(link);
  if (saved.onboardingComplete) {
    const groups = [
      ['School and club', ['displayName', 'school', 'customSchool']],
      ['Rank and experience', ['belt', 'rankLabel', 'dan', 'years', 'experience', 'level']],
      ['Discipline and goals', ['discipline', 'priority', 'forms', 'goals']],
      ['Availability', ['sessions', 'duration', 'days', 'timezone']]
    ];
    for (const [title, keys] of groups) {
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = title;
      section.append(heading);
      for (const key of keys) {
        const label = document.querySelector(`label[for=${key}]`);
        if (label) section.append(label);
        section.append(document.getElementById(key));
      }
      const save = document.createElement('button');
      save.type = 'submit';
      save.textContent = 'Save ' + title.toLowerCase();
      section.append(save);
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = 'Cancel changes';
      cancel.onclick = () => {
        restore();
        say('Unsaved changes canceled.');
      };
      section.append(cancel);
      container.append(section);
    }
    const searchLabel = document.createElement('label');
    searchLabel.textContent = 'Find your school';
    const search = document.createElement('input');
    search.type = 'search';
    search.setAttribute('aria-label', 'Find your school');
    searchLabel.append(search);
    document.getElementById('school').before(searchLabel);
    search.oninput = () => {
      for (const option of document.getElementById('school').options)
        option.hidden = !option.textContent.toLowerCase().includes(search.value.toLowerCase());
    };
  }
  const guest = localStorage.getItem('kyorugi-planner-v1');
  if (guest) {
    const button = document.createElement('button');
    button.textContent = 'Review guest plan import';
    button.onclick = async () => {
      try {
        const draft = JSON.parse(guest);
        if (!draft || typeof draft !== 'object' || Array.isArray(draft))
          throw new Error('Invalid guest plan');
        const summary = `${Object.keys(draft.weeks || {}).length} saved weeks, ${(draft.tournaments || []).length} tournaments, club: ${draft.club || 'berkeley'}`;
        if (
          confirm(
            summary +
              '\nReplace your account plan with this browser’s guest plan? Your guest copy will remain.'
          )
        ) {
          await account.save(saved, draft);
          planner = draft;
          say('Guest plan imported.');
        }
      } catch (e) {
        say('Import failed: ' + e.message);
      }
    };
    root.append(button);
  }
  const reload = document.createElement('button');
  reload.textContent = 'Reload account data';
  reload.onclick = async () => {
    if (dirty && !confirm('Discard unsaved edits and reload account data?')) return;
    try {
      await account.load();
      saved = account.record.profile;
      planner = account.record.planner;
      restore();
      say('Latest account data loaded.');
    } catch (e) {
      say(e.message);
    }
  };
  root.append(reload);
  const remove = document.createElement('button');
  remove.textContent = 'Delete account';
  remove.onclick = async () => {
    if (!confirm('Permanently delete your account, profile, and private plan?')) return;
    try {
      const { data } = await client.auth.getSession();
      const origin = config.apiOrigin;
      if (!origin) throw new Error('Account deletion service is not configured.');
      const response = await fetch(new URL('/account', origin), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      });
      if (!response.ok) throw new Error('Deletion failed. Retry later.');
      dirty = false;
      await client.auth.signOut();
      location.href = 'signup.html';
    } catch (e) {
      say(e.message);
    }
  };
  root.append(remove);
  if (!saved.onboardingComplete) {
    const steps = [
      ['Your school', ['displayName', 'school', 'customSchool', 'timezone']],
      [
        'Your Taekwondo background',
        ['belt', 'rankLabel', 'dan', 'years', 'experience', 'level', 'discipline', 'forms']
      ],
      ['Your training preferences', ['priority', 'goals', 'days', 'sessions', 'duration']]
    ];
    let step = 0;
    const progress = document.createElement('h2');
    container.before(progress);
    const back = document.createElement('button');
    back.type = 'button';
    back.textContent = 'Back';
    const next = document.createElement('button');
    next.type = 'button';
    next.textContent = 'Continue';
    const submit = document.querySelector('#profile-form button');
    submit.before(back, next);
    function show() {
      conditional();
      progress.textContent = `Step ${step + 1} of 3: ${steps[step][0]}`;
      for (const [key] of fields) {
        const input = document.getElementById(key);
        const enabled = steps[step][1].includes(key);
        input.closest('fieldset')?.toggleAttribute('hidden', !enabled);
        input.hidden = !enabled || input.hidden;
        const label = document.querySelector(`label[for=${key}]`);
        if (label) label.hidden = !enabled || label.hidden;
      }
      back.hidden = step === 0;
      next.hidden = step === 2;
      submit.hidden = step !== 2;
      submit.textContent = 'Save profile & view my plan';
    }
    function resetVisibility() {
      for (const [key] of fields) {
        document.getElementById(key).hidden = false;
        const label = document.querySelector(`label[for=${key}]`);
        if (label) label.hidden = false;
      }
    }
    back.onclick = () => {
      step--;
      resetVisibility();
      show();
    };
    next.onclick = () => {
      if (step === 0 && !document.getElementById('displayName').reportValidity()) return;
      step++;
      resetVisibility();
      show();
    };
    show();
  }
})();
