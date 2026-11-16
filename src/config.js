// ---------------------------------------------------------------------------------------------
// Site settings. These are the only values you normally need to touch.
// ---------------------------------------------------------------------------------------------

// The "Download for Android" buttons.
// When the real installer is ready: put LeafSpectra.apk in /public, then set
//   url: '/LeafSpectra.apk', fileName: 'LeafSpectra.apk', isTest: false
// Set url to '' to show "APK not yet available — coming soon" instead of a button.
export const DOWNLOAD = {
  url: '/apk.txt',
  fileName: 'apk.txt',
  isTest: true, // shows "Test download only — Android APK coming soon."
};

// Release details shown in the download section. Leave empty until verified ("To be announced").
export const RELEASE = {
  appVersion: '',
  minAndroid: '',
  apkSize: '',
};

// Leafity's occasional appearances, in seconds, and how often each surprise-peek size is drawn (%).
export const LEAFITY = {
  headerMinSeconds: 120,
  headerMaxSeconds: 240,
  surpriseMinSeconds: 50,
  surpriseMaxSeconds: 110,
  peekSmallPercent: 45,
  peekMediumPercent: 35,
  peekGiantPercent: 20,
};
