// A small stand-in for the Claude Design page runtime, enough for the LeafSpectra page:
// a component base class with props/state/setState, and React-style refs.
export const React = { createRef: () => ({ current: null }) };

export class DCLogic {
  constructor() {
    this.props = {};
    this.state = {};
    this.onUpdate = null; // set by main.js: re-applies renderVals() to the page
  }
  setState(patch, done) {
    Object.assign(this.state, typeof patch === 'function' ? patch(this.state, this.props) : patch);
    if (this.onUpdate) this.onUpdate();
    if (done) done();
  }
  forceUpdate() { if (this.onUpdate) this.onUpdate(); }
}
