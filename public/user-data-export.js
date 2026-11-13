(function (root) {
  'use strict';

  function createUserDataExport(input) {
    const source = input && typeof input === 'object' ? input : {};
    const account = source.account && typeof source.account === 'object'
      ? {
          uid: typeof source.account.uid === 'string' ? source.account.uid.slice(0, 160) : '',
          email: typeof source.account.email === 'string' ? source.account.email.slice(0, 254) : '',
        }
      : null;
    const friends = Array.isArray(source.friends) ? source.friends.flatMap((friend) => {
      if (!friend || typeof friend !== 'object' || typeof friend.uid !== 'string' || !/^[\w-]{1,160}$/.test(friend.uid)) return [];
      const since = Number(friend.since);
      return [{
        uid: friend.uid,
        name: typeof friend.name === 'string' ? friend.name.slice(0, 40) : 'Друг',
        avatar: typeof friend.avatar === 'string' ? friend.avatar.slice(0, 8) : '✦',
        since: Number.isFinite(since) && since > 0 ? since : null,
      }];
    }) : [];
    const limitations = Array.isArray(source.limitations)
      ? source.limitations.filter((item) => typeof item === 'string').map((item) => item.slice(0, 160)).slice(0, 10)
      : [];

    return {
      version: 3,
      exportedAt: typeof source.exportedAt === 'string' ? source.exportedAt : new Date().toISOString(),
      account,
      profile: source.profile && typeof source.profile === 'object' ? source.profile : {},
      proofs: Array.isArray(source.proofs) ? source.proofs : [],
      friends,
      mikaConversation: Array.isArray(source.mikaConversation) ? source.mikaConversation.slice(-20) : [],
      limitations,
    };
  }

  root.AiryUserDataExport = Object.freeze({ create: createUserDataExport });
})(typeof window === 'undefined' ? globalThis : window);
