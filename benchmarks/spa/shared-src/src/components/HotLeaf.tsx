import React, { useState } from 'react';
import '../styles/hot-leaf.css';

export default function HotLeaf() {
  const [count, setCount] = useState(0);

  return (
    <div className="hot-leaf" data-testid="hot-leaf">
      <span className="hot-leaf-label">HotLeaf</span>
      <button className="hot-leaf-btn" onClick={() => setCount((c) => c + 1)}>
        count: {count}
      </button>
    </div>
  );
}
