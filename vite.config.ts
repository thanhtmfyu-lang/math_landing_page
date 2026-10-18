import {publicSitemapPlugin} from './scripts/public-sitemap.mjs';
import {generatePracticeBank} from './scripts/generate-practice-bank.mjs';
import {publicExamCatalogPlugin} from './scripts/public-exam-catalog.mjs';
generatePracticeBank();

  import { defineConfig } from 'vite';
  import react from '@vitejs/plugin-react-swc';
  import path from 'path';
  import {btvnDevPlugin} from './server/btvn/dev-plugin';

  export default defineConfig(({command})=>{
    if(command==='build'&&(process.env.MTM_BTVN_DEMO==='1'||process.env.MTM_R106_PREVIEW==='1'))throw new Error('Tắt MTM_BTVN_DEMO và MTM_R106_PREVIEW trước khi tạo bản phát hành.');
    return {
    // Cache riêng trong worktree: build/ bị middleware chặn, node_modules dùng chung.
    cacheDir: process.env.MTM_BTVN_DEMO==='1'?'.qa-temp/btvn-vite-cache':undefined,
    plugins: [publicExamCatalogPlugin(),react(),...(command==='serve'&&process.env.VERCEL!=='1'?[btvnDevPlugin()]:[]),publicSitemapPlugin()],
    resolve: {
      extensions: ['.js', '.jsx', '.ts', '.tsx', '.json'],
      alias: {
        'vaul@1.1.2': 'vaul',
        'sonner@2.0.3': 'sonner',
        'recharts@2.15.2': 'recharts',
        'react-resizable-panels@2.1.7': 'react-resizable-panels',
        'react-hook-form@7.55.0': 'react-hook-form',
        'react-day-picker@8.10.1': 'react-day-picker',
        'next-themes@0.4.6': 'next-themes',
        'lucide-react@0.487.0': 'lucide-react',
        'input-otp@1.4.2': 'input-otp',
        'figma:asset/e65f7186f6bc7a7850301b3d3ae8015d83670579.png': path.resolve(__dirname, './src/assets/e65f7186f6bc7a7850301b3d3ae8015d83670579.png'),
        'figma:asset/d56a53b54b176fd3ff4b77016e41cca55d662b40.png': path.resolve(__dirname, './src/assets/d56a53b54b176fd3ff4b77016e41cca55d662b40.png'),
        'figma:asset/c3828b87f854d6b00602b5cf82b0722439681986.png': path.resolve(__dirname, './src/assets/c3828b87f854d6b00602b5cf82b0722439681986.png'),
        'figma:asset/bd36b26f465734ac6ed738bfb7b629af3f695065.png': path.resolve(__dirname, './src/assets/bd36b26f465734ac6ed738bfb7b629af3f695065.png'),
        'figma:asset/9f15f8306d80b093260628ceb1f8fb76e40aec8d.png': path.resolve(__dirname, './src/assets/9f15f8306d80b093260628ceb1f8fb76e40aec8d.png'),
        'figma:asset/9d658ea6d8327bc9490e1829f8861bb4221904ef.png': path.resolve(__dirname, './src/assets/9d658ea6d8327bc9490e1829f8861bb4221904ef.png'),
        'figma:asset/7f1902646d8820defe0abb2d92fb62d08f0bb20f.png': path.resolve(__dirname, './src/assets/7f1902646d8820defe0abb2d92fb62d08f0bb20f.png'),
        'figma:asset/7e1c4bdfd740391c0189286f640a886737fbeea2.png': path.resolve(__dirname, './src/assets/7e1c4bdfd740391c0189286f640a886737fbeea2.png'),
        'figma:asset/3a0a47e483030d752b74a16044b2bd5c5183d3ba.png': path.resolve(__dirname, './src/assets/3a0a47e483030d752b74a16044b2bd5c5183d3ba.png'),
        'figma:asset/35b1461c5a7359dbd98f1549d1acd92a614c862b.png': path.resolve(__dirname, './src/assets/35b1461c5a7359dbd98f1549d1acd92a614c862b.png'),
        'embla-carousel-react@8.6.0': 'embla-carousel-react',
        'cmdk@1.1.1': 'cmdk',
        'class-variance-authority@0.7.1': 'class-variance-authority',
        '@radix-ui/react-tooltip@1.1.8': '@radix-ui/react-tooltip',
        '@radix-ui/react-toggle@1.1.2': '@radix-ui/react-toggle',
        '@radix-ui/react-toggle-group@1.1.2': '@radix-ui/react-toggle-group',
        '@radix-ui/react-tabs@1.1.3': '@radix-ui/react-tabs',
        '@radix-ui/react-switch@1.1.3': '@radix-ui/react-switch',
        '@radix-ui/react-slot@1.1.2': '@radix-ui/react-slot',
        '@radix-ui/react-slider@1.2.3': '@radix-ui/react-slider',
        '@radix-ui/react-separator@1.1.2': '@radix-ui/react-separator',
        '@radix-ui/react-select@2.1.6': '@radix-ui/react-select',
        '@radix-ui/react-scroll-area@1.2.3': '@radix-ui/react-scroll-area',
        '@radix-ui/react-radio-group@1.2.3': '@radix-ui/react-radio-group',
        '@radix-ui/react-progress@1.1.2': '@radix-ui/react-progress',
        '@radix-ui/react-popover@1.1.6': '@radix-ui/react-popover',
        '@radix-ui/react-navigation-menu@1.2.5': '@radix-ui/react-navigation-menu',
        '@radix-ui/react-menubar@1.1.6': '@radix-ui/react-menubar',
        '@radix-ui/react-label@2.1.2': '@radix-ui/react-label',
        '@radix-ui/react-hover-card@1.1.6': '@radix-ui/react-hover-card',
        '@radix-ui/react-dropdown-menu@2.1.6': '@radix-ui/react-dropdown-menu',
        '@radix-ui/react-dialog@1.1.6': '@radix-ui/react-dialog',
        '@radix-ui/react-context-menu@2.2.6': '@radix-ui/react-context-menu',
        '@radix-ui/react-collapsible@1.1.3': '@radix-ui/react-collapsible',
        '@radix-ui/react-checkbox@1.1.4': '@radix-ui/react-checkbox',
        '@radix-ui/react-avatar@1.1.3': '@radix-ui/react-avatar',
        '@radix-ui/react-aspect-ratio@1.1.2': '@radix-ui/react-aspect-ratio',
        '@radix-ui/react-alert-dialog@1.1.6': '@radix-ui/react-alert-dialog',
        '@radix-ui/react-accordion@1.2.3': '@radix-ui/react-accordion',
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      target: 'esnext',
      outDir: 'build',
      manifest: true,
    },
    server: {
      watch: process.env.MTM_BTVN_DEMO==='1'?{ignored:['**/build/**','**/dist/**']}:undefined,
      port: 3000,
      open: process.env.MTM_BTVN_DEMO==='1'?false:true,
    },
  };});
