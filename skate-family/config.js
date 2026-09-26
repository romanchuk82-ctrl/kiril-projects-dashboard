export const MP_VERSION = '1.0.1';
export const MP_WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
export const MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

export const PROFILES = [
  { id:'kyryl', name:'Кирил', initials:'КР' },
  { id:'ira', name:'Іра', initials:'ІР' },
  { id:'sonia', name:'Соня', initials:'СН' },
];

export const JUMPS = [
  {id:'auto', label:'Авто / не знаю', turns:null},
  {id:'1T', label:'1T · Single Toe Loop', turns:1},
  {id:'1S', label:'1S · Single Salchow', turns:1},
  {id:'1Lo', label:'1Lo · Single Loop', turns:1},
  {id:'1F', label:'1F · Single Flip', turns:1},
  {id:'1Lz', label:'1Lz · Single Lutz', turns:1},
  {id:'1A', label:'1A · Single Axel', turns:1.5},
  {id:'2T', label:'2T · Double Toe Loop', turns:2},
  {id:'2S', label:'2S · Double Salchow', turns:2},
  {id:'2Lo', label:'2Lo · Double Loop', turns:2},
  {id:'2F', label:'2F · Double Flip', turns:2},
  {id:'2Lz', label:'2Lz · Double Lutz', turns:2},
  {id:'2A', label:'2A · Double Axel', turns:2.5},
  {id:'3T', label:'3T · Triple Toe Loop', turns:3},
  {id:'3S', label:'3S · Triple Salchow', turns:3},
  {id:'3Lo', label:'3Lo · Triple Loop', turns:3},
  {id:'3F', label:'3F · Triple Flip', turns:3},
  {id:'3Lz', label:'3Lz · Triple Lutz', turns:3},
  {id:'3A', label:'3A · Triple Axel', turns:3.5},
];
