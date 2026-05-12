import React from 'react';
import '../styles/about.css';

export default function About() {
  return (
    <main className="page">
      <h1 className="page-title">About</h1>
      <p className="page-body">
        This page is loaded via a dynamic import — one route split.
      </p>
    </main>
  );
}
