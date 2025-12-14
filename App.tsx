import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, Camera, Wand2, Info, RefreshCw, Pipette } from 'lucide-react';
import ColorWheel from './components/ColorWheel';
import { calculateFiltration, getSVGFilterMatrix, formatFiltration, normalizeToYM, rgbToWheelPosition, addFiltration } from './utils/colorMath';
import { analyzeColorCast } from './services/gemini';
import { ColorCorrection } from './types';

const App: React.FC = () => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  
  // State for the Base Filter Pack (What is currently on the enlarger)
  const [basePack, setBasePack] = useState<ColorCorrection>({ y: 0, m: 0, c: 0 });
  
  // State for the Adjustment (Calculated from the wheel)
  const [adjustment, setAdjustment] = useState<ColorCorrection>({ y: 0, m: 0, c: 0 });
  
  const [filterMatrix, setFilterMatrix] = useState<string>('1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isPicking, setIsPicking] = useState(false);
  const [wheelOverride, setWheelOverride] = useState<{angle: number, distance: number} | null>(null);
  const [aiMessage, setAiMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Derived State: Total Filtration = Base + Adjustment
  const totalFiltration = useMemo(() => {
    return addFiltration(basePack, adjustment);
  }, [basePack, adjustment]);

  // Handle Wheel Changes
  const handleWheelChange = (angle: number, distance: number) => {
    // 1. Calculate visual filter (RGB) for the CSS/SVG
    // The visual filter is now inverted (Complementary) inside the helper
    const matrix = getSVGFilterMatrix(angle, distance);
    setFilterMatrix(matrix);

    // 2. Calculate Adjustment Values (CMY)
    // The adjustment is now based on correcting the cast
    const adj = calculateFiltration(angle, distance);
    setAdjustment(adj);
    
    setWheelOverride(null);
  };

  // Handle Base Pack Inputs
  const handleBaseChange = (field: keyof ColorCorrection, value: string) => {
    const num = parseFloat(value) || 0;
    setBasePack(prev => ({ ...prev, [field]: num }));
  };

  // Handle Pipette Click on Image
  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!isPicking || !imageRef.current) return;

    const img = imageRef.current;
    const rect = img.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const naturalX = x * (img.naturalWidth / rect.width);
    const naturalY = y * (img.naturalHeight / rect.height);

    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(img, naturalX, naturalY, 1, 1, 0, 0, 1, 1);
      const pixel = ctx.getImageData(0, 0, 1, 1).data;
      const [r, g, b] = pixel;

      const { angle, distance } = rgbToWheelPosition(r, g, b);

      // Force wheel to this position
      setWheelOverride({ angle, distance });
      
      // Trigger updates immediately
      const matrix = getSVGFilterMatrix(angle, distance);
      setFilterMatrix(matrix);
      const adj = calculateFiltration(angle, distance);
      setAdjustment(adj);
      
      setAiMessage(`Sampled Color Cast: R${r} G${g} B${b}`);
    }

    setIsPicking(false);
  };

  // File Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageSrc(event.target.result as string);
          setAiMessage(null);
          setFilterMatrix('1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
          setAdjustment({ y: 0, m: 0, c: 0 });
          setWheelOverride({ angle: 0, distance: 0 });
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
      
      const aiAdj = normalizeToYM(
        result.suggestion.c, 
        result.suggestion.m, 
        result.suggestion.y
      );
      
      // AI returns a "Suggestion" (Correction), so we set it as adjustment
      setAdjustment(aiAdj);
      
      // Note: We don't move the wheel for AI results currently as AI returns YMC values directly,
      // creating a 1:1 map back to wheel angle is complex due to normalization.
      // We accept the discrepancy for now or could implement a reverse map later.
      
    } catch (err) {
      setAiMessage("Could not analyze image. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 text-gray-200 flex flex-col items-center pb-12">
      {/* SVG Filter Definition */}
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
          onClick={() => setAiMessage(prev => prev ? null : "1. Enter your current Enlarger Filters (Base Pack). 2. Tap Pipette and click a neutral area on the photo. 3. Use the Wheel to fine tune until the image looks gray. 4. The New Filter Pack is your next setting.")}
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

        {/* Image Preview */}
        <div className="relative w-full aspect-[4/5] bg-black rounded-xl overflow-hidden shadow-2xl ring-1 ring-neutral-800 group">
          {isPicking && (
            <div className="absolute top-0 left-0 right-0 z-20 bg-darkroom-accent/90 text-white text-center py-2 text-sm font-medium backdrop-blur-sm pointer-events-none animate-in fade-in">
              Tap a neutral gray area (e.g. concrete, road, gray card)
            </div>
          )}

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
              ref={imageRef}
              src={imageSrc} 
              alt="Test Print" 
              onClick={handleImageClick}
              className={`w-full h-full object-contain transition-all duration-75 ${isPicking ? 'cursor-crosshair' : ''}`}
              style={{ filter: 'url(#colorGrade)' }}
            />
          )}

          {/* Floating Actions */}
          {imageSrc && (
            <div className="absolute top-4 right-4 flex flex-col gap-2 z-30">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="p-2 bg-black/50 backdrop-blur text-white rounded-full hover:bg-black/70 transition-colors"
                title="Replace Image"
              >
                <Upload size={18} />
              </button>
              
              <button 
                onClick={() => setIsPicking(!isPicking)}
                className={`p-2 backdrop-blur text-white rounded-full transition-colors ${isPicking ? 'bg-white text-black' : 'bg-black/50 hover:bg-black/70'}`}
                title="White Balance Picker"
              >
                <Pipette size={18} />
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

        {/* BASE PACK INPUTS */}
        {imageSrc && (
          <div className="flex flex-col gap-2 bg-neutral-800/30 p-4 rounded-xl border border-neutral-800">
            <label className="text-xs font-mono text-gray-500 uppercase tracking-widest text-center">Starting Filter Pack</label>
            <div className="flex justify-center gap-4">
              {['y', 'm', 'c'].map((channel) => (
                <div key={channel} className="flex flex-col items-center">
                  <label className={`text-xs font-bold mb-1 uppercase ${
                    channel === 'y' ? 'text-yellow-500' : channel === 'm' ? 'text-fuchsia-500' : 'text-cyan-500'
                  }`}>{channel}</label>
                  <input
                    type="number"
                    value={basePack[channel as keyof ColorCorrection]}
                    onChange={(e) => handleBaseChange(channel as keyof ColorCorrection, e.target.value)}
                    className="w-16 bg-neutral-900 border border-neutral-700 rounded p-2 text-center font-mono text-sm focus:border-white focus:outline-none transition-colors"
                    placeholder="0"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Controls Section */}
        <div className="flex flex-col md:flex-row gap-8 items-center justify-center p-2">
          
          {/* Wheel */}
          <div className="flex-shrink-0">
             <ColorWheel 
               size={220} 
               onChange={handleWheelChange} 
               isProcessing={false} 
               forcedValue={wheelOverride}
             />
          </div>

          {/* TOTAL RESULTS */}
          <div className="flex flex-col gap-4 w-full md:w-auto min-w-[200px]">
            <div className="bg-neutral-800 rounded-xl p-6 border border-neutral-700 flex flex-col items-center text-center shadow-inner relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-500 via-fuchsia-500 to-cyan-500 opacity-50"></div>
              
              <h2 className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-2">Correction</h2>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-4xl font-bold font-mono tracking-tighter text-white">
                  {formatFiltration(adjustment)}
                </span>
              </div>
              
              <div className="w-full border-t border-neutral-700 pt-3 flex flex-col items-center">
                 <h2 className="text-xs font-mono text-gray-500 uppercase tracking-widest mb-1">New Filter Pack</h2>
                 <span className="text-xl font-mono text-darkroom-accent font-bold">
                    {formatFiltration(totalFiltration)}
                 </span>
              </div>
            </div>

            {/* Adjustment Breakdown (Total Stats) */}
            <div className="grid grid-cols-3 gap-2 opacity-70">
              <ValueCard label="Y" value={totalFiltration.y} color="text-yellow-400" />
              <ValueCard label="M" value={totalFiltration.m} color="text-fuchsia-400" />
              <ValueCard label="C" value={totalFiltration.c} color="text-gray-400" />
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
      {Math.round(value)}
    </span>
  </div>
);

export default App;