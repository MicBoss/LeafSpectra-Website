// PhoneMockup — the placeholder Android phone frame. Its markup is prerendered in index.html
// (all concept screens, one shown at a time); this computes which screen shows and how it tilts.
// To use a real screenshot later, pass `image` (a URL) and it replaces the concept screen.
const NAMES = { home: 'the garden home screen', grow: 'vegetable suggestions', guide: 'a growing guide', care: 'care records and reminders', observe: 'a guided leaf observation', monitor: 'changes over time', leafity: 'the Ask Leafity chat' };

export function phoneVals(props) {
  const screen = props.screen ?? 'home', image = props.image ?? '', hasImage = !!image;
  const is = (s) => !hasImage && screen === s;
  return {
    image, hasImage,
    isHome: is('home'), isGrow: is('grow'), isGuide: is('guide'), isCare: is('care'), isObserve: is('observe'), isMonitor: is('monitor'), isLeafity: is('leafity'),
    floatCls: (props.float ?? true) ? 'pm-float' : '',
    tiltDeg: (Number(props.tilt) || 0) + 'deg',
    ariaLabel: props.label || ((hasImage ? 'Screenshot of ' : 'Concept preview (not a real screenshot) of ') + (NAMES[screen] || 'the LeafSpectra app')),
  };
}
