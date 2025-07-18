const Spinner = ({ size = 32 }) => {
  const svgSize = size === 16 ? 16 : 32;
  return (
    <>
    <style jsx>{`
        .spinner-chasing {
          animation: 2s linear infinite spinner-svg-animation;
          max-width: 100px;
        }

        @keyframes spinner-svg-animation {
          0% {
            transform: rotateZ(0deg);
          }
          100% {
            transform: rotateZ(360deg);
          }
        }

        .spinner-chasing circle {
          animation: 1.4s ease-in-out infinite both spinner-circle-animation;
          display: block;
          fill: transparent;
          stroke: #4f46e5; /* Tailwind indigo-600 hex value */
          stroke-linecap: round;
          stroke-dasharray: 283;
          stroke-dashoffset: 280;
          stroke-width: 10px;
          transform-origin: 50% 50%;
        }

        @keyframes spinner-circle-animation {
          0%, 25% {
            stroke-dashoffset: 280;
            transform: rotate(0);
          }
          50%, 75% {
            stroke-dashoffset: 75;
            transform: rotate(45deg);
          }
          100% {
            stroke-dashoffset: 280;
            transform: rotate(360deg);
          }
        }
      `}</style>
    <svg className="spinner-chasing" width={svgSize} height={svgSize} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="45" fill="transparent" />
    </svg>
    </>
  );
};

export default Spinner;
