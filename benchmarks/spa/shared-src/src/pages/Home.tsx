import React from 'react';
import HotLeaf from '../components/HotLeaf';
import '../styles/home.css';

export default function Home() {
  return (
    <main className="page">
      <h1 className="page-title">Home</h1>
      <HotLeaf />
      <StaticAssetDemo />
    </main>
  );
}

function StaticAssetDemo() {
  return (
    <section className="asset-demo">
      <img src="/assets/logo.svg" alt="logo" width={64} height={64} />
    </section>
  );
}
