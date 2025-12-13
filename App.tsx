import React, { useState, useRef, useEffect } from 'react';
import { Upload, Camera, Wand2, Info, RefreshCw } from 'lucide-react';
import ColorWheel from './components/ColorWheel';
import { calculateFiltration, getSVGFilterMatrix, formatFiltration, normalizeToYM } from './utils/colorMath';
import { analyzeColorCast } from './services/gemini';
import { ColorCorrection } from './types';

const App: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [filtration, setFiltration] = useState<ColorCorrection>({ y: 0, m: 0, c: 0 });
  const [filterMatrix, setFilterMatrix] = useState<string>('1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle Wheel Changes
  const handleWheelChange = (angle: number, distance: number) => {
    // 1. Calculate visual filter (RGB) for the CSS/SVG
    const matrix = getSVGFilterMatrix(angle, distance);
    setFilterMatrix(matrix);

    // 2. Calculate Enlarger Values (CMY) - Logic now locks C to 0
    const adjustments = calculateFiltration(angle, distance);
    setFiltration(adjustments);
  };

  // File Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageSrc(event.target.result as string);
          setAiMessage(null);
          // Reset filters on new image
          setFilterMatrix('1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
          setFiltration({ y: 0, m: 0, c: 0 });
        }
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  // AI Analysis
  const handleAutoBalance = async () => {
    if (!imageSrc) return;
    setIsAnalyzing(true);
    setAiMessage("Gemini is analyzing the print cast...");
    
    try {
      const result = await analyzeColorCast(imageSrc);
      setAiMessage(result.description);
      
      // Normalize AI suggestion to fit the Y/M only workflow
      const normalizedSuggestion = normalizeToYM(
        result.suggestion.c, 
        result.suggestion.m, 
        result.suggestion.y
      );
      
      setFiltration(normalizedSuggestion);
    } catch (err) {
      setAiMessage("Could not analyze image. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-gray-200 flex flex-col items-center">
      {/* SVG Filter Definition - Must be present in DOM */}
      {/* Added key to force re-render when matrix changes to ensure visual update */}
      <svg className="absolute w-0 h-0 pointer-events-none" aria-hidden="true">
        <defs>
          <filter id="colorGrade" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
            <feColorMatrix
              key={filterMatrix} 
              type="matrix"
              values={filterMatrix}
            />
          </filter>
        </defs>
      </svg>

      {/* Header */}
      <header className="w-full p-4 border-b border-neutral-800 bg-neutral-900/90 backdrop-blur sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-yellow-400 via-magenta-500 to-cyan-500" />
          <h1 className="font-bold text-lg tracking-tight">ChromaLab</h1>
        </div>
        <button 
          onClick={() => setAiMessage(prev => prev ? null : "Upload a photo of your test print. Drag the wheel until the screen image looks neutral gray. The values shown are your darkroom filter pack adjustments.")}
          className="p-2 text-gray-500 hover:text-white"
        >
          <Info size={20} />
        </button>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 w-full max-w-2xl p-4 flex flex-col gap-6">
        
        {/* Info Box */}
        {aiMessage && (
          <div className="bg-neutral-800 border border-neutral-700 p-4 rounded-lg text-sm text-gray-300 animate-in fade-in slide-in-from-top-2">
            <p className="font-mono text-xs text-darkroom-accent uppercase mb-1">System Message</p>
            {aiMessage}
          </div>
        )}

        {/* Image Preview Area */}
        <div className="relative w-full aspect-[4/5] bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-neutral-800 group">
          {!imageSrc ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 gap-4">
              <Camera size={48} className="opacity-50" />
              <p className="text-sm font-medium">Upload a Test Print</p>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-full text-sm font-medium transition-colors border border-neutral-700"
              >
                Select Photo
              </button>
            </div>
          ) : (
            <img 
              src={imageSrc} 
              alt="Test Print" 
              className="w-full h-full object-contain transition-all duration-75"
              style={{ filter: 'url(#colorGrade)' }}
            />
          )}

          {/* Floating Actions */}
          {imageSrc && (
            <div className="absolute top-4 right-4 flex flex-col gap-2">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 bg-black/50 backdrop-blur text-white rounded-full hover:bg-black/70 transition-colors"
                title="Replace Image"
              >
                <Upload size={18} />
              </button>
              <button 
                onClick={handleAutoBalance}
                disabled={isAnalyzing}
                className={`p-2 backdrop-blur text-white rounded-full transition-colors ${isAnalyzing ? 'bg-indigo-500/50 animate-pulse' : 'bg-indigo-600/80 hover:bg-indigo-500'}`}
                title="AI Auto-Detect Cast"
              >
                {isAnalyzing ? <RefreshCw className="animate-spin" size={18} /> : <Wand2 size={18} />}
              </button>
            </div>
          )}
        </div>

        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          accept="image/*" 
          className="hidden" 
        />

        {/* Controls Section */}
        <div className="flex flex-col md:flex-row gap-8 items-center justify-center p-4">
          
          {/* Wheel */}
          <div className="flex-shrink-0">
             <ColorWheel 
               size={220} 
               onChange={handleWheelChange} 
               isProcessing={false} 
             />
          </div>

          {/* Results Display */}
          <div className="flex flex-col gap-4 w-full md:w-auto min-w-[200px]">
            <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700 flex flex-col items-center text-center shadow-inner">
              <h2 className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-4">Filtration Adjustment</h2>
              
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-4xl font-bold font-mono tracking-tighter text-white">
                  {formatFiltration(filtration)}
                </span>
              </div>
              
              <p className="text-xs text-gray-500 max-w-[160px] leading-relaxed">
                Adjust your enlarger dichroic head by these amounts (C is locked to 0).
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <ValueCard label="Y" value={filtration.y} color="text-yellow-400" />
              <ValueCard label="M" value={filtration.m} color="text-fuchsia-400" />
              <ValueCard label="C" value={filtration.c} color="text-gray-600" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

// Helper Component for stats
const ValueCard: React.FC<{ label: string, value: number, color: string }> = ({ label, value, color }) => (
  <div className="bg-neutral-800/50 rounded-lg p-2 flex flex-col items-center border border-neutral-700/50">
    <span className={`text-xs font-bold ${color}`}>{label}</span>
    <span className="font-mono text-lg">
      {value > 0 ? '+' : ''}{Math.round(value)}
    </span>
  </div>
);

export default App;