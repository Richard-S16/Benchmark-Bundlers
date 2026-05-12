import React, { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Home from './pages/Home';

const About = lazy(() => import('./pages/About'));

export default function App() {
  return (
    <>
      <Header />
      <Suspense fallback={<div className="loading">Loading…</div>}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </Suspense>
    </>
  );
}
