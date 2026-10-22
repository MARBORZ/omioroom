export type Lang = "en" | "ru";

export interface Translations {
  common: {
    brand: string;
    myRooms: string;
    back: string;
    save: string;
    change: string;
    copied: string;
    copyLink: string;
    loading: string;
    close: string;
    room: string;
    public: string;
    private: string;
  };
  status: {
    connected: string;
    connecting: string;
    reconnecting: string;
    disconnected: string;
    buffering: string;
    error: string;
    inSync: string;
  };
  home: {
    tagline: string;
    watchingAs: string;
    nicknamePlaceholder: string;
    createTitle: string;
    roomTitleLabel: string;
    roomTitlePlaceholder: string;
    privateMode: string;
    publicMode: string;
    createBtn: string;
    or: string;
    joinTitle: string;
    globalIdLabel: string;
    privateKeyLabel: string;
    privateKeyPlaceholder: string;
    joinBtn: string;
    errors: {
      privateCodeRequired: string;
      invalidPrivateCode: string;
      roomFull: string;
      roomNotFound: string;
      genericCreateError: string;
      genericJoinError: string;
    };
  };
  room: {
    standby: string;
    standbyDesc: string;
    videoSource: string;
    videoSourcePlaceholder: string;
    addVideo: string;
    urlError: string;
    inviteTitle: string;
    copyInviteBtn: string;
    inviteCopied: string;
    privateKeyNotice: string;
    rotateKey: string;
    rotateConfirm: string;
    switchToPublic: string;
    switchToPrivate: string;
    leaveRoom: string;
    inSyncRev: (rev: number) => string;
    offset: string;
    closedAlert: string;
    skipBackward: string;
    skipForward: string;
    playVideo: string;
    pauseVideo: string;
    unmute: string;
    mute: string;
  };
  myRooms: {
    title: string;
    empty: string;
    createOne: string;
    enterRoom: string;
    closeConfirm: string;
  };
}
