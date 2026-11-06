import React from 'react';
import { interpolate } from 'remotion';
import type { SceneContext } from '../types';
import { theme } from '../theme';

export const meta = {
  id: 'sys.counter-race', title: 'Rate limiter: lost updates and atomic admission', pack: 'sys',
  llm: 'stage: hook | sequential | race | result | gap | atomic | rule. Fifty requests, limit ten, shared Redis counter.',
  status: 'ready' as const
};

/** A single shared counter. Each dot is exactly one request, never a separate user. */
export const Scene: React.FC<{context: SceneContext}> = ({context}) => {
  const stage = String(context.beat.templateProps?.stage || 'hook');
  const t = context.localFrame / Math.max(1, context.durationInFrames - 1);
  const red = '#ee827c', green = '#87cfa9', gold = theme.accent;
  const lerp = (a: number, b: number) => interpolate(t, [a,b], [0,1], {extrapolateLeft:'clamp',extrapolateRight:'clamp'});
  const text = (x:number,y:number,value:string,size=24,color:string=theme.text) => <text x={x} y={y} textAnchor="middle" fontFamily={theme.mono} fontSize={size} fill={color}>{value}</text>;
  const card = (x:number,y:number,w:number,title:string,value:string,color:string) => <g>
    <rect x={x} y={y} width={w} height={132} rx={16} fill="#101218" stroke={color} strokeWidth={2}/>
    {text(x+w/2,y+38,title,19,theme.muted)}{text(x+w/2,y+99,value,value.length > 10 ? 26 : 44,color)}
  </g>;
  const atomic = stage === 'atomic';
  const sequential = stage === 'sequential';
  const count = Math.min(sequential ? 12 : 50, stage === 'result' ? 50 : Math.floor(lerp(.12,.68)*(sequential ? 12 : 50)));
  return <svg width={1080} height={720} viewBox="0 0 1080 720" role="img" aria-label={`Rate limiter ${stage}`}>
    {text(540,30,'ONE SYSTEM, ONE WEEK · DAY 2/7',18,gold)}
    {stage === 'rule' ? <g>
      {text(540,145,'CLOSE THE RACE WINDOW',34,gold)}
      {card(90,205,420,'AVOID','GET → check → SET',red)}
      {card(550,205,440,'USE','INCR → check',green)}
      {text(540,405,'TTL + increment: one Lua operation',27,green)}
      {text(540,465,'Stripe: atomic Lua check-and-spend',23,theme.muted)}
      {text(540,570,'NEXT · THE MINUTE BOUNDARY',24,gold)}
      {text(540,625,'100 before + 100 after = 200 in 1s',25)}
    </g> : stage === 'gap' ? <g>
      {text(540,130,'REQUEST A',24,gold)}
      <path d="M160 240 H920" stroke={theme.muted} strokeWidth={3}/>
      <rect x={340} y={185} width={400*lerp(.1,.4)} height={110} fill={red} opacity={.15}/>
      {text(210,235,'GET 0',28)}{text(540,235,'RACE WINDOW',25,red)}{text(870,235,'SET 1',28)}
      {[0,1,2,3].map(i=><g key={i} opacity={lerp(.2+i*.1,.3+i*.1)}>
        <path d={`M${400+i*80} 420 V290`} stroke={red} strokeWidth={2} strokeDasharray="6 6"/>
        <circle cx={400+i*80} cy={420-130*lerp(.2+i*.1,.4+i*.1)} r={8} fill={red}/>
        {text(400+i*80,460,`GET 0`,19,red)}
      </g>)}
      {text(540,565,'Other requests read before A writes.',25)}
      {text(540,625,'Two commands leave room to interleave.',22,theme.muted)}
    </g> : <g>
      {text(540,95,sequential?'ONE REQUEST AT A TIME':atomic?'DISTINCT RESULTS · ONE AT A TIME':'50 REQUESTS · SAME API KEY',24,gold)}
      {Array.from({length:50},(_,i)=>{
        const active = i<count;
        const denied = (atomic||sequential)&&i>=10;
        const color = active ? denied?red:atomic||sequential?green:red : '#303441';
        const phase = stage==='race'?lerp(.15,.35):0;
        return <g key={i}>
          <rect x={110+(i%10)*87} y={140+Math.floor(i/10)*50} width={70} height={35} rx={7} fill={color} opacity={active?1:.35}/>
          {text(145+(i%10)*87,164+Math.floor(i/10)*50,atomic&&active?String(i+1):stage==='race'&&phase>.6?'0':String(i+1),18,active?'#080a0d':theme.muted)}
        </g>;
      })}
      {text(540,435,atomic?'INCR returns 1, 2, 3 … 50':sequential?'GET → check → SET; then next request':stage==='race'?(t<.5?'Every GET sees 0 → every check passes':'Every SET writes 1 → updates are lost'):stage==='result'?'50 overwritten writes → one stored increment':'10 allowed? Watch the burst.',23,atomic?green:theme.muted)}
      {card(90,480,260,'LIMIT','10',gold)}
      {card(390,480,280,'ALLOWED',String(atomic||sequential?Math.min(10,count):count),atomic||sequential?green:red)}
      {card(710,480,280,'REDIS COUNT',String(atomic?count:sequential?Math.min(10,count):stage === 'result' || t>.5?1:0),atomic?green:red)}
      {text(540,665,atomic?'1–10: 200 OK     11–50: 429':sequential?'Sequential tests pass. Concurrency is untested.':'Illustrated worst-case interleaving · not every run',20,theme.muted)}
    </g>}
  </svg>;
};
