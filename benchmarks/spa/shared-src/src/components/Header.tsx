import React from 'react';
import { Link } from 'react-router-dom';
import '../styles/header.css';

export default function Header() {
  return (
    <header className="header">
      <nav className="nav">
        <Link to="/" className="nav-link">Home</Link>
        <Link to="/about" className="nav-link">About</Link>
      </nav>
    </header>
  );
}
