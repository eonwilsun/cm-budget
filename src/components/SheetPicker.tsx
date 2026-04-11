interface SheetPickerProps {
  fileName: string;
  sheetNames: string[];
  onSelect: (sheetName: string) => void;
  onBack: () => void;
}

export default function SheetPicker({ fileName, sheetNames, onSelect, onBack }: SheetPickerProps) {
  return (
    <div className="flex flex-col items-center gap-6 w-full max-w-md mx-auto">
      <div className="text-center">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">Choose a Sheet</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{fileName}</p>
      </div>

      <div className="w-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {sheetNames.map((name, i) => (
          <button
            key={name}
            onClick={() => onSelect(name)}
            className={`w-full flex items-center gap-3 px-5 py-3.5 text-left text-sm hover:bg-blue-50 dark:hover:bg-blue-950 transition-colors ${
              i < sheetNames.length - 1
                ? "border-b border-gray-100 dark:border-gray-700"
                : ""
            }`}
          >
            <span className="text-blue-400 shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
            </span>
            <span className="font-medium text-gray-800 dark:text-gray-100">{name}</span>
            <span className="ml-auto text-gray-400">→</span>
          </button>
        ))}
      </div>

      <button
        onClick={onBack}
        className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      >
        ← Upload a different file
      </button>
    </div>
  );
}

