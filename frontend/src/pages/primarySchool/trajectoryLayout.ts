/** Fit the complete work axis inside the visible chart, including its last point. */
export function trajectoryLayout(availableWidth:number,workCount:number,height:number){
 const width=Number.isFinite(availableWidth)&&availableWidth>0?availableWidth:640;
 const left=Math.min(48,width/3),right=Math.min(28,width/4),plot=width-left-right;
 const spacing=workCount>1?plot/(workCount-1):plot;
 return {width,spacing,x:(index:number)=>left+plot*(workCount>1?index/(workCount-1):.5),y:(percent:number)=>height-30-percent*(height-56)/100,
  tickStride:Math.max(1,Math.ceil(45/Math.max(1,spacing))),showDates:spacing>=90,showEveryValue:spacing>=45};
}
