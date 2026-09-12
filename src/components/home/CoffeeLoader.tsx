const NATIVE_WIDTH = 300;
const NATIVE_HEIGHT = 280;

export function CoffeeLoader({ size = 100 }: { size?: number }) {
  const scale = size / NATIVE_WIDTH;
  const height = Math.round(NATIVE_HEIGHT * scale);

  return (
    <div
      className="coffee-machine-scale"
      style={{ width: size, height }}
      role="presentation"
      aria-hidden
    >
      <div
        className="coffee-machine-loader"
        style={{ transform: `scale(${scale})` }}
      >
        <div className="coffee-machine-header">
          <div className="coffee-machine-header__buttons coffee-machine-header__button-one" />
          <div className="coffee-machine-header__buttons coffee-machine-header__button-two" />
          <div className="coffee-machine-header__display" />
          <div className="coffee-machine-header__details" />
        </div>
        <div className="coffee-machine-medium">
          <div className="coffee-machine-medium__exit" />
          <div className="coffee-machine-medium__arm" />
          <div className="coffee-machine-medium__liquid" />
          <div className="coffee-machine-medium__smoke coffee-machine-medium__smoke-one" />
          <div className="coffee-machine-medium__smoke coffee-machine-medium__smoke-two" />
          <div className="coffee-machine-medium__smoke coffee-machine-medium__smoke-three" />
          <div className="coffee-machine-medium__smoke coffee-machine-medium__smoke-four" />
          <div className="coffee-machine-medium__cup" />
        </div>
        <div className="coffee-machine-footer" />
      </div>
    </div>
  );
}
