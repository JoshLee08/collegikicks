/* Shared private account state. Guest planner storage is never used as an account cache. */
window.KyorugiAccount = (() => {
  let client, user, record = {profile:{},planner:{},revision:0}, blocked=false;
  const config=window.KYORUGI_ACCOUNT_CONFIG || {};
  function status(message) {
    let el=document.getElementById('sync-status');
    if(!el){el=document.createElement('p');el.id='sync-status';el.setAttribute('role','status');document.querySelector('main')?.prepend(el);}
    if(el)el.textContent=message;
  }
  async function load(){
    if(!user)return;
    const {data,error}=await client.from('athlete_accounts').select('profile,planner,revision').eq('user_id',user.id).maybeSingle();
    if(error)throw error;
    record=data || {profile:{},planner:{},revision:0};blocked=false;
    return structuredClone(record);
  }
  async function save(profile,planner,replace=false){
    if(blocked&&!replace)throw new Error('Reload account data or explicitly replace the remote version.');
    if(replace)await load();
    const {data,error}=await client.rpc('save_athlete_account',{expected_revision:record.revision,new_profile:profile,new_planner:planner});
    if(error){blocked=true;throw error;}
    record={profile:structuredClone(profile),planner:structuredClone(planner),revision:data};
    return record;
  }
  const ready=(async()=>{
    if(!config.url||!config.publishableKey)return null;
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.49.8');
    client=createClient(config.url,config.publishableKey);
    const {data,error}=await client.auth.getSession();if(error)throw error;
    user=data.session?.user;
    client.auth.onAuthStateChange((event,session)=>{
      if(event==='SIGNED_OUT'||(user&&session?.user.id!==user.id)){record={profile:{},planner:{},revision:0};location.reload();}
    });
    if(user)await load();
    return user || null;
  })();
  return {ready,load,save,status,get client(){return client;},get user(){return user;},get record(){return structuredClone(record);},get configured(){return !!(config.url&&config.publishableKey);}};
})();
