// Tư vấn và trợ lý lớp học cùng dùng Zalo Toán Thầy Thành.
export const ZALO_ASSISTANT_URL='https://zalo.me/0967365413';

// Nguồn duy nhất cho các kênh chính thức của Minh Thành Math.
export const MTM_SOCIAL_CHANNELS = [
  {id:'zalo',label:'Zalo',url:ZALO_ASSISTANT_URL},
  {id:'facebook',label:'Facebook',url:'https://www.facebook.com/minhthanhmath/'},
  {id:'tiktok',label:'TikTok',url:'https://www.tiktok.com/@minhthanhmath'},
  {id:'youtube',label:'YouTube',url:'https://www.youtube.com/channel/UC1n4Z0exxmO8iEW90rJK-Sg'},
  {id:'threads',label:'Threads',url:'https://www.threads.com/@minhthanhmaths'},
  {id:'instagram',label:'Instagram',url:'https://www.instagram.com/minhthanhmaths/'},
] as const;
export type MtmSocialChannel = typeof MTM_SOCIAL_CHANNELS[number]['id'];
