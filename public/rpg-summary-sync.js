(function(root){
  'use strict';
  function summaryRevision(profile){
    const value=profile&&typeof profile==='object'?profile:{};
    return [Number(value.lastRpgEventAt)||0,Number(value.rpgSummaryUpdatedAt)||0,value.rpgSummaryNeedsRebuild===true?1:0].join(':');
  }
  function createRpgSummarySync(){
    let scope='',sequence=0;
    return {
      setScope(value){scope=String(value||'');sequence+=1;return scope;},
      begin(value){if(String(value||'')!==scope)return null;sequence+=1;return sequence;},
      invalidate(){sequence+=1;},
      isCurrent(value,ticket){return String(value||'')===scope&&ticket===sequence;},
      changed(previous,next){return summaryRevision(previous)!==summaryRevision(next);}
    };
  }
  root.AiryRpgSummarySync={createRpgSummarySync};
})(window);
