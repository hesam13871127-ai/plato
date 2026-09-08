import type { GameMeta, ShopSkin } from '../../core/types';
import { MiniCanvas, Spin } from '../../ui/three/shared';
import { ChessPlay } from './Play';
import { ChessPiece3D } from './Board';

const pieceSkinStub = (finish: ShopSkin['finish'], colors: Record<string, string>) =>
  ({ finish, colors } as unknown as ShopSkin);

const pieceSkins: ShopSkin[] = [
  {
    id: 'chess-pieces-ivory',
    gameId: 'chess',
    kind: 'pieces',
    name: { fa: 'عاج و ابونوس', en: 'Ivory & Ebony' },
    price: 0,
    colors: { w: '#efe9dc', b: '#332a26' },
    finish: 'matte',
    Preview: () => (
      <MiniCanvas camera={{ position: [0, 1.4, 2.2], fov: 40 }}>
        <group position={[0, -0.45, 0]} scale={0.9}>
          <ChessPiece3D piece={{ color: 'w', type: 'k' }} />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'chess-pieces-metal',
    gameId: 'chess',
    kind: 'pieces',
    name: { fa: 'برنز و نقره', en: 'Bronze & Silver' },
    price: 260,
    colors: { w: '#c0c7d1', b: '#8a5a2b' },
    finish: 'metal',
    Preview: () => (
      <MiniCanvas camera={{ position: [0, 1.4, 2.2], fov: 40 }}>
        <group position={[0, -0.45, 0]} scale={0.9}>
          <ChessPiece3D piece={{ color: 'b', type: 'q' }} skin={pieceSkinStub('metal', { w: '#c0c7d1', b: '#8a5a2b' })} />
        </group>
      </MiniCanvas>
    ),
  },
  {
    id: 'chess-pieces-neon',
    gameId: 'chess',
    kind: 'pieces',
    name: { fa: 'نئون', en: 'Neon' },
    price: 420,
    colors: { w: '#67e8f9', b: '#f472b6' },
    finish: 'glow',
    Preview: () => (
      <MiniCanvas camera={{ position: [0, 1.4, 2.2], fov: 40 }}>
        <group position={[0, -0.45, 0]} scale={0.9}>
          <ChessPiece3D piece={{ color: 'w', type: 'n' }} skin={pieceSkinStub('glow', { w: '#67e8f9', b: '#f472b6' })} />
        </group>
      </MiniCanvas>
    ),
  },
];

const boardSkins: ShopSkin[] = [
  {
    id: 'chess-board-walnut',
    gameId: 'chess',
    kind: 'board',
    name: { fa: 'گردو و افرا', en: 'Walnut & Maple' },
    price: 0,
    colors: { light: '#e8d5b0', dark: '#7a5230', rim: '#2b2118' },
    Preview: BoardPreview('#e8d5b0', '#7a5230'),
  },
  {
    id: 'chess-board-arctic',
    gameId: 'chess',
    kind: 'board',
    name: { fa: 'قطبی', en: 'Arctic' },
    price: 220,
    colors: { light: '#dbe7ef', dark: '#4a6a86', rim: '#1d2c3a' },
    Preview: BoardPreview('#dbe7ef', '#4a6a86'),
  },
  {
    id: 'chess-board-obsidian',
    gameId: 'chess',
    kind: 'board',
    name: { fa: 'ابسیدین', en: 'Obsidian' },
    price: 380,
    colors: { light: '#3a3450', dark: '#16131f', rim: '#0b0913' },
    Preview: BoardPreview('#3a3450', '#16131f'),
  },
];

function BoardPreview(light: string, dark: string) {
  return () => (
    <MiniCanvas camera={{ position: [0, 2.9, 3.2], fov: 40 }}>
      <group position={[0, -0.55, 0]} rotation-x={-Math.PI / 2}>
        {Array.from({ length: 16 }, (_, i) => {
          const r = Math.floor(i / 4);
          const c = i % 4;
          return (
            <mesh key={i} position={[(c - 1.5) * 0.62, (r - 1.5) * 0.62, 0.01]}>
              <planeGeometry args={[0.62, 0.62]} />
              <meshStandardMaterial color={(r + c) % 2 === 0 ? light : dark} roughness={0.85} />
            </mesh>
          );
        })}
      </group>
      <group position={[-0.31, -0.35, -0.31]}>
        <ChessPiece3D piece={{ color: 'w', type: 'p' }} />
      </group>
      <group position={[0.31, -0.35, 0.31]}>
        <ChessPiece3D piece={{ color: 'b', type: 'r' }} />
      </group>
    </MiniCanvas>
  );
}

function Logo() {
  return (
    <MiniCanvas camera={{ position: [0, 1.7, 3.6], fov: 40 }}>
      <Spin speed={0.5}>
        <group position={[-0.7, 0, 0]}>
          <ChessPiece3D piece={{ color: 'w', type: 'k' }} />
        </group>
        <group position={[0.8, 0, 0.15]}>
          <ChessPiece3D piece={{ color: 'b', type: 'n' }} />
        </group>
      </Spin>
    </MiniCanvas>
  );
}

export const chessMeta: GameMeta = {
  id: 'chess',
  names: { fa: 'شطرنج', en: 'Chess' },
  tagline: { fa: 'نبرد ذهن‌ها روی ۶۴ خانه', en: 'The battle of minds on 64 squares' },
  minPlayers: 2,
  maxPlayers: 2,
  accent: '#a855f7',
  Logo,
  Play: ChessPlay,
  skins: [...pieceSkins, ...boardSkins],
  tutorial: {
    fa: [
      {
        title: 'هدف',
        body: 'کیش و مات کردن شاه حریف؛ یعنی طوری حمله کن که شاه او هیچ راه فراری نداشته باشد. شاه هرگز زده نمی‌شود — فقط تهدید می‌شود!',
      },
      {
        title: 'حرکت مهره‌ها',
        body: 'سرباز یک خانه جلو (از خانهٔ شروع دو خانه)، اسب L شکل، فیل مورب، رخ مستقیم، وزیر هر دو جهت و شاه یک خانه در همهٔ جهات.',
      },
      {
        title: 'حرکات ویژه',
        body: 'آنپاسان: سربازی که حرکت دوتایی حریف را رد می‌کند می‌تواند آن را بزند. قلعه (Castling): شاه و رخ هم‌زمان حرکت می‌کنند وقتی هیچ‌کدام جابه‌جا نشده باشند و بینشان خالی باشد. ارتقا: سربازی که به ردیف آخر برسد به وزیر یا هر مهرهٔ دیگر تبدیل می‌شود.',
      },
      {
        title: 'پایان بازی',
        body: 'کیش و مات (برد)، پات — بازیکن نوبت‌دار حرکتی ندارد ولی در کیش هم نیست (مساوی)، توافق/کمبود مهره (مساوی).',
      },
    ],
    en: [
      {
        title: 'Goal',
        body: "Checkmate the enemy king — attack it so it has no escape. Kings are never captured, only threatened!",
      },
      {
        title: 'How pieces move',
        body: 'Pawns step forward (two from their start), knights in an L, bishops diagonally, rooks in straight lines, queens both ways, kings one square anywhere.',
      },
      {
        title: 'Special moves',
        body: 'En passant lets a pawn capture a double-stepping enemy pawn. Castling tucks the king behind a rook when neither has moved. Promotion turns a pawn reaching the last rank into a queen (or any piece).',
      },
      {
        title: 'Endings',
        body: 'Checkmate wins. Stalemate — the player to move has no legal move but is not in check — is a draw, as is insufficient material.',
      },
    ],
  },
};
