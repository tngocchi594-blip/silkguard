import React from 'react';

/**
 * 跨视图复用的排版原子。
 * 原本挤在 1299 行的 main.jsx 尾部，任何一个视图想拆出去都会被它们绊住。
 */

export function PanelTitle({ kicker, title, action }) {
  return <div className="panel-title"><div><span>{kicker}</span><h2>{title}</h2></div>{action}</div>;
}

export function PageIntro({ kicker, title, body, action }) {
  return <section className="page-intro"><div><span>{kicker}</span><h1>{title}</h1><p>{body}</p></div>{action}</section>;
}

export function Target({ label, value, note }) {
  return <div className="target-row"><div><b>{label}</b><small>{note}</small></div><strong>{value}</strong></div>;
}

export function EmptyState({ icon: Icon, title, body }) {
  return <div className="empty-state"><Icon size={30} /><h3>{title}</h3><p>{body}</p></div>;
}
