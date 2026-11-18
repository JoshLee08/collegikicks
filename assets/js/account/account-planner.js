(async()=>{
 const account=window.KyorugiAccount;
 const main=document.querySelector('main');main.inert=true;
 let queue=Promise.resolve(),active=false;
 function apply(record){
   for(const key of Object.keys(settings))delete settings[key];
   Object.assign(settings,{tournaments:[],tournament:'',weeks:{},teams:{},club:'later'},record.planner);
   settings.profile=record.profile;
   const clubs={'UC Berkeley':'berkeley','Fresno State':'fresno','Menlo College':'menlo',USC:'usc',UCI:'uci',UCSD:'ucsd','UC Davis':'ucd',UCLA:'ucla'};
   settings.club=clubs[record.profile.school] || 'custom';
   if(document.getElementById('planner')){render();refreshScheduleEditor();document.getElementById("club").value=settings.club;document.getElementById("team-times").value=scheduleLines(settings.teams[settings.club]||[]);}else {renderTournamentSummary();renderTournaments();}
 }
 try{
  const user=await account.ready;
  if(!user)return;
  apply(account.record);active=true;
  window.addEventListener('kyorugi-save',()=>{
    if(!active)return;
    const snapshot=structuredClone(settings);
    queue=queue.then(async()=>{
      account.status('Saving account plan…');
      try{
        const profile={...account.record.profile};
        const schools={berkeley:'UC Berkeley',fresno:'Fresno State',menlo:'Menlo College',usc:'USC',uci:'UCI',ucsd:'UCSD',ucd:'UC Davis',ucla:'UCLA'};
        if(schools[snapshot.club])profile.school=schools[snapshot.club];else if(snapshot.club!=="custom")profile.school="Add later";
        snapshot.profile=profile;settings.profile=profile;
        await account.save(profile,snapshot);account.status('Account plan saved.');
      }catch(error){account.status('Not saved: '+error.message+' Your edits remain in this tab.');showRecovery(snapshot);}
    });
  });
  function showRecovery(draft){
    if(document.getElementById('sync-recovery'))return;
    const box=document.createElement('div');box.id='sync-recovery';
    for(const [label,action] of [['Reload account plan',async()=>apply(await account.load())],['Replace remote with this tab',async()=>{if(confirm('Replace the remote account plan with this tab’s edits?'))await account.save(account.record.profile,draft,true);} ]]){
      const b=document.createElement('button');b.textContent=label;b.onclick=async()=>{try{await action();box.remove();account.status('Account plan updated.');}catch(e){account.status(e.message);}};box.append(b);
    }document.getElementById('sync-status').after(box);
  }
 }catch(error){account.status('Account could not load: '+error.message+' Reload to retry.');return;}
 finally{if(!account.user||active)main.inert=false;}
})();
