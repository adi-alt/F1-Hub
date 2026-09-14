import fs from 'fs';
import path from 'path';

async function fetchCircuits() {
  console.log("Fetching circuits.json...");
  const res = await fetch("https://raw.githubusercontent.com/julesr0y/f1-circuits-svg/main/circuits.json");
  if (!res.ok) throw new Error("Failed to fetch circuits.json");
  const circuits = await res.json();
  
  const metadata = {
    source: "https://github.com/julesr0y/f1-circuits-svg",
    fetchedAt: new Date().toISOString(),
  };
  const shapes: Record<string, { path: string; viewBox: string }> = {};

  for (const c of circuits) {
    if (!c.layouts || c.layouts.length === 0) continue;
    const latestLayout = c.layouts[c.layouts.length - 1];
    
    const url = `https://raw.githubusercontent.com/julesr0y/f1-circuits-svg/main/circuits/detailed/white/${latestLayout.layoutId}.svg`;
    console.log(`Fetching ${url}...`);
    try {
      const svgRes = await fetch(url);
      if (!svgRes.ok) {
        console.warn(`Could not fetch SVG for ${c.id}: ${url}`);
        continue;
      }
      const svgText = await svgRes.text();
      // Extract the viewBox
      const viewBoxMatch = svgText.match(/viewBox="([^"]+)"/);
      const viewBox = viewBoxMatch ? viewBoxMatch[1] : "0 0 1000 1000";

      // Extract the first <path d="..."> we find
      const match = svgText.match(/<path[^>]*d="([^"]+)"/);
      if (match && match[1]) {
        const shapeData = { path: match[1], viewBox };
        shapes[c.id.toLowerCase()] = shapeData;
        if (c.name) shapes[c.name.toLowerCase()] = shapeData;
        if (c.location) shapes[c.location.toLowerCase()] = shapeData;
      }
    } catch (err) {
      console.warn(`Error fetching SVG for ${c.id}:`, err);
    }
  }

  const outPath = path.join(process.cwd(), 'src/lib/circuitShapes.json');
  fs.writeFileSync(outPath, JSON.stringify({ metadata, shapes }, null, 2));
  console.log(`Saved ${Object.keys(shapes).length} shapes to ${outPath}`);
}

fetchCircuits().catch(console.error);
