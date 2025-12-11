# App Icon Setup Instructions

## Icon Design
The app icon features two people (buddies) with a sports ball, representing the concept of finding a sports partner.

## Source Files
- **SVG Source**: `src/assets/icon/app-icon.svg` (512x512)
- **Optimized SVG**: `src/assets/icon/app-icon-optimized.svg` (108x108 for Android)

## To Generate App Icons:

### 1. Generate Favicon (for web)
1. Open `src/assets/icon/app-icon.svg` in a browser or image editor
2. Export as PNG at 512x512 pixels
3. Save as `src/assets/icon/favicon.png`
4. Or use an online tool: https://cloudconvert.com/svg-to-png

### 2. Generate Android Icons (if needed)
The Android launcher foreground XML has been updated with the new icon design.
If you need to regenerate PNG icons:

1. Install Capacitor Assets (if not already installed):
   ```bash
   npm install --save-dev @capacitor/assets
   ```

2. Create `assets/icon.png` (1024x1024) from the SVG source

3. Run:
   ```bash
   npx @capacitor/assets generate
   ```

### 3. Current Status
- ✅ Android launcher foreground XML updated
- ✅ Android launcher background color updated (green gradient)
- ⚠️ Favicon PNG needs to be generated from SVG

## Icon Design Elements:
- Two people silhouettes (representing buddies/partners)
- Sports ball between them
- Green-to-blue gradient background
- White foreground elements for contrast

