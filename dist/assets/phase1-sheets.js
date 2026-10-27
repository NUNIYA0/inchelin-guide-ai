import {createLocationPicker} from './location-picker.js?v=154';
// Only the initial location picker remains a dialog. Optional conditions use chat.
export function mountPhase1Sheets({send,isBusy}){
  const picker=createLocationPicker({send,isBusy});
  return {open(key='location'){if(key==='location')picker.open();},dialog:picker.dialog};
}
