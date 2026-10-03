export default function NavBar() {
  return (
    <header className="navbar">
      <div className="brand">
        <img className="brand-mark" src="/logo.png" alt="Montréal Tree Analytics" />
        <span className="brand-name">Montréal Tree Analytics</span>
      </div>
      <nav className="nav-links">
        <a className="nav-link active" href="#carte">
          Carte
        </a>
        <a
          className="nav-link"
          href="http://127.0.0.1:8000/docs"
          target="_blank"
          rel="noopener"
        >
          API
        </a>
      </nav>
    </header>
  );
}
