import { Express } from 'express';
import express from 'express';
import { Server } from 'http';
import path from 'path';

// Render-specific modifications
export function applyRenderModifications(app: Express, httpServer: Server) {
  // Set correct port for Render
  const PORT = process.env.PORT || 10000;
  
  // Log Render deployment info
  console.log(`Render deployment: Server will run on port ${PORT}`);

  // Serve static files from the correct location in Render
  if (process.env.NODE_ENV === 'production') {
    const clientPath = path.join(__dirname, '..', 'client', 'dist');
    console.log(`Serving static files from: ${clientPath}`);
    app.use('/', express.static(clientPath));
    
    // Catch-all route for client-side routing
    app.get('*', (req, res) => {
      // API routes should be handled by the server
      if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      
      // All other routes should serve the index.html
      res.sendFile(path.join(clientPath, 'index.html'));
    });
  }
}