export function CoffeeLoader() {
  return (
    <div className="coffee-loader" role="presentation">
      <div className="coffee-loader-cup">
        <div className="coffee-loader-handle" />
        <div className="coffee-loader-smoke one" />
        <div className="coffee-loader-smoke two" />
        <div className="coffee-loader-smoke three" />
      </div>
      <div className="coffee-loader-label" aria-hidden>
        ..........................
      </div>
    </div>
  );
}
