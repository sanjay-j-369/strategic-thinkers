const fs = require('fs');

// We are asked to use: clear primary color, complementary secondary, well-balanced neutrals. No purple, no blue.
// Emerald (green) & Amber (gold) on Zinc (neutral)
// Primary: emerald-600 (#059669) / dark: emerald-400 (#34d399)
// Secondary: amber-500 (#f59e0b) / dark: amber-400 (#fbbf24)

// Light backgrounds: zinc-50 (#fafafa)
// Dark backgrounds: zinc-950 (#18181b)

const files = [
    'frontend/app/guide/page.tsx',
    'frontend/app/sign-up/page.tsx',
    'frontend/app/privacy/page.tsx',
    'frontend/app/ingest/page.tsx',
    'frontend/app/sign-in/page.tsx',
    'frontend/app/meetings/page.tsx',
    'frontend/app/page.tsx',
    'frontend/components/Guideard.tsx',
    'frontend/components/PrepCard.tsx',
    'frontend/components/PrivacyTable.tsx'
];

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf-8');
    
    // Replace sky with emerald
    content = content.replace(/sky-50/g, 'emerald-50');
    content = content.replace(/const fs = require('fs');

// ')
// We are asked to use:rep// Emerald (green) & Amber (gold) on Zinc (neutral)
// Primary: emerald-600 (#059669) / dark: emerald-400 (#34d3ef// Primary: emerald-600 (#059669) / dark: emerald-Ta// Secondary: amber-500 (#f59e0b) / dark: amber-400 (#fbbf24)
-5
// Light backgrounds: zinc-50 (#fafafa)
// Dark backgrounds400// Dark backgrounds: zinc-950 (#18181bxt
const files = [
    'frontend/app/gui(fi    'frontend/ri    'frontend/app/sign-up/page.tsco    'frontend/app/privacy/page.tsx'd"    'frontend/app/ingest/page.tsx',00    'frontend/app/sign-in/page.tsxn'    'frontend/app/meetings/page.tsxe(    'frontend/app/page.tsx',
    'frt-    'frontend/components/Guld    'frontend/components/PrepCard.tsx', r    'frontend/components/PrivacyTable.un];

files.forEach(file => {
    let contes 
Mai    let content = fs.rex    
    // Replace sky with emerald
    contentce   ex    content = content.replace();    content = content.replace(/const fs = require('fs'is
// ')
// We are asked to use:rep// Emerald (green) & Ant)// W;
// Primary: emerald-600 (#059669) / dark: emerald-400 (#34d3ef// Primary: em_c-5
// Light backgrounds: zinc-50 (#fafafa)
// Dark backgrounds400// Dark backgrounds: zinc-950 (#18181bxt
const files = [
    'frontend/app/gui(fi    'frontend/ri    'fronten 9/%;// Dark backgrounds400// Dark backgroud:const files = [
    'frontend/app/gui(fi    'frontend/ri    '/*    'frontend/--    'frt-    'frontend/components/Guld    'frontend/components/PrepCard.tsx', r    'frontend/components/PrivacyTable.un];

files.forEach(file => {
    let contes 
Mai    let content = fs.rex    
    // Replace sky with emerald
    contentce   ex    mb
files.forEach(file => {
    let contes 
Mai    let content = fs.rex    
    // Replace sky with emerald
    contentce  ute    let contes 
Mai    4Mai    let con50    // Replace sky with emeral0     contentce   ex    content gr// ')
// We are asked to use:rep// Emerald (green) & Ant)// W;
// Primary: emerald-600 (#059669) / dark:  0// W98// Primary: emerald-600 (#059669) / dark: emerald-400 (  // Light backgrounds: zinc-50 (#fafafa)
// Dark backgrounds400// Dark backgrounon// Dark backgrounds400// Dark backgrouunconst files = [
    'frontend/app/gui(fi    'frontend/ri    '%     'frontend/0     'frontend/app/gui(fi    'frontend/ri    '/*    'frontend/--    'frt-    'frontend/components/Guld    'frontov
files.forEach(file => {
    let contes 
Mai    let content = fs.rex    
    // Replace sky with emerald
    contentce   ex    mb
files.forEach(file => {
    let contes 
Mai    let cotto    let contes 
Mai    4Mai    let conam    // Replace sky with emeralda    contentce   ex    mb
files  files.forEach(file => {%;    let contes 
Mai   /
Mai    let conre    // Replace sky with emeral40    contentce  ute    let cont 3Mai    4Mai    let con50    // Run// We are asked to use:rep// Emerald (green) & Ant)// W;
// Primary: emerald-600 (#059669) /: // Primary: emerald-600 (#059669) / dark:  0// W98// Pr  // Dark backgrounds400// Dark backgrounon// Dark backgrounds400// Dark backgrouunconst files = [
    'frontend/app/gui(fi    'frontend/ri    '%  e(    'frontend/app/gui(fi    'frontend/ri    '%     'frontend/0     'frontend/app/gui(fi    'fro/,files.forEach(file => {
    let contes 
Mai    let content = fs.rex    
    // Replace sky with emerald 
