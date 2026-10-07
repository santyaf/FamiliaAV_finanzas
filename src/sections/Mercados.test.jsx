// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

let TRM = 4000;
let STOCKS = false;
const fetchMarket = vi.fn(async (kind) => {
  if (kind === 'trm') return { value: TRM, date: '2026-10-07', series: Array.from({ length: 12 }, (_, i) => ({ date: `2026-09-${String(i + 10).padStart(2, '0')}`, value: 3900 + i * 10 })) };
  if (kind === 'status') return { trm: true, crypto: true, stocks: STOCKS };
  if (kind === 'crypto_markets') return [
    { id: 'bitcoin', symbol: 'BTC', name: 'Bitcoin', image: '', price: 80000, change24h: -2, marketCap: 1, rank: 1 },
    { id: 'ethereum', symbol: 'ETH', name: 'Ethereum', image: '', price: 3000, change24h: 1, marketCap: 1, rank: 2 },
  ];
  if (kind === 'crypto_history') return { series: Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}`, value: 70000 + i * 300 })) };
  throw new Error('no esperado');
});
vi.mock('../lib/market', () => ({ fetchMarket: (...a) => fetchMarket(...a), marketErrorText: (e) => e?.message || '' }));
import { Mercados } from './Mercados';

afterEach(() => cleanup());

const usdHolding = { id: 'h1', ownerMemberId: 'me', assetClass: 'divisa', symbol: 'USD', name: 'Dólares (USD)', exchange: null, quoteCurrency: 'USD', archived: false };
const usdTrade = { id: 't1', holdingId: 'h1', date: '2020-01-01', side: 'compra', units: 100, cop: 400000, createdAt: '1', transactionId: null };
const data = { currency: 'COP', members: [{ id: 'me', name: 'Ana' }], accounts: [{ id: 'a1', name: 'Nómina' }] };
const emptyStore = () => ({ holdings: [], trades: [], prices: [], settings: { fxSource: 'trm', weniaBuy: null, weniaSell: null, fxAlert: false } });
const withUsd = (extraTrades = []) => ({ ...emptyStore(), holdings: [usdHolding], trades: [usdTrade, ...extraTrades] });
const mk = (store) => ({
  userId: 'me',
  loadPortfolio: vi.fn().mockResolvedValue(store),
  ensureHolding: vi.fn().mockResolvedValue('new1'), setHoldingArchived: vi.fn().mockResolvedValue(), deleteHolding: vi.fn().mockResolvedValue(),
  saveHoldingPrices: vi.fn().mockResolvedValue(), saveInvestmentSettings: vi.fn().mockResolvedValue(),
  addHoldingTrade: vi.fn().mockResolvedValue('tr1'), deleteHoldingTrade: vi.fn().mockResolvedValue(),
});
const open = async (store, actions = mk(store)) => { render(<Mercados data={data} actions={actions} />); await screen.findByText('TASA ACTIVA DE VENTA'); return actions; };

beforeEach(() => { TRM = 4000; STOCKS = false; fetchMarket.mockClear(); });

describe('Mercados — divisas', () => {
  it('sin operaciones muestra la TRM y invita a registrar la primera compra', async () => {
    await open(emptyStore());
    expect((await screen.findAllByText(/4\.000,00/)).length).toBeGreaterThan(0);
    expect(screen.getByText('TRM · Banco de la República', { selector: 'p' })).toBeTruthy();
    expect(screen.getByText(/Registra tu primera compra de dólares/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Registrar venta' }).disabled).toBe(true);
  });

  it('registra la primera compra: crea la posición solo para mí y guarda la tasa de la operación', async () => {
    const actions = await open(emptyStore());
    fireEvent.click(screen.getByRole('button', { name: 'Registrar compra' }));
    fireEvent.change(screen.getByLabelText('Pesos de la operación'), { target: { value: '400000' } });
    fireEvent.change(screen.getByLabelText('Unidades de la operación'), { target: { value: '100' } });
    expect(screen.getByText(/4\.?000.*\/ USD/, { selector: 'b' })).toBeTruthy(); // tasa implícita
    fireEvent.click(screen.getByRole('button', { name: 'Guardar compra' }));
    await waitFor(() => expect(actions.addHoldingTrade).toHaveBeenCalled());
    expect(actions.ensureHolding).toHaveBeenCalledWith(expect.objectContaining({ assetClass: 'divisa', symbol: 'USD', ownerMemberId: 'me' }));
    expect(actions.addHoldingTrade).toHaveBeenCalledWith(expect.objectContaining({ holdingId: 'new1', side: 'compra', units: 100, cop: 400000, fxRate: 4000, accountId: null }));
  });

  it('puede compartir la posición con el hogar y mover dinero de una cuenta', async () => {
    const actions = await open(emptyStore());
    fireEvent.click(screen.getByRole('button', { name: 'Registrar compra' }));
    fireEvent.change(screen.getByLabelText('Quién ve esta posición'), { target: { value: 'hogar' } });
    fireEvent.change(screen.getByLabelText('Cuenta de la operación'), { target: { value: 'a1' } });
    expect(screen.getByText(/gasto de inversión en esa cuenta/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Pesos de la operación'), { target: { value: '100000' } });
    fireEvent.change(screen.getByLabelText('Unidades de la operación'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar compra' }));
    await waitFor(() => expect(actions.addHoldingTrade).toHaveBeenCalled());
    expect(actions.ensureHolding).toHaveBeenCalledWith(expect.objectContaining({ ownerMemberId: null }));
    expect(actions.addHoldingTrade).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'a1', memberId: 'me' }));
  });

  it('muestra la posición, el costo promedio y la oportunidad cuando la TRM supera el costo', async () => {
    TRM = 4200;
    await open(withUsd());
    expect(await screen.findByText('US$ 100,00')).toBeTruthy();
    expect(screen.getByText(/Tasa promedio 4\.000,00/)).toBeTruthy();
    expect(await screen.findByText('La TRM está por encima de tu tasa promedio de compra')).toBeTruthy();
    expect(screen.getByText(/Si vendieras hoy a TRM, ganarías/)).toBeTruthy();
  });
  it('si la TRM está por debajo, avisa cuánto falta', async () => {
    TRM = 3900;
    await open(withUsd());
    expect(await screen.findByText('La TRM aún está por debajo de tu tasa promedio')).toBeTruthy();
    expect(screen.getByText(/Te faltan 100,00 por dólar/)).toBeTruthy();
  });

  it('no deja vender más de lo que se tiene', async () => {
    const actions = await open(withUsd());
    await screen.findByText('US$ 100,00');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar venta' }));
    expect(screen.getByText(/Disponible para vender: 100 USD/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Pesos de la operación'), { target: { value: '900000' } });
    fireEvent.change(screen.getByLabelText('Unidades de la operación'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar venta' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/No puedes vender 500: a esa fecha solo tenías 100/);
    expect(actions.addHoldingTrade).not.toHaveBeenCalled();
  });

  it('elegir Wenia guarda la fuente y pide sus tasas; con la de venta escrita pasa a ser la tasa activa', async () => {
    const actions = await open(withUsd());
    fireEvent.click(screen.getByRole('button', { name: 'Wenia (manual)' }));
    await waitFor(() => expect(actions.saveInvestmentSettings).toHaveBeenCalledWith(expect.objectContaining({ fxSource: 'wenia' })));
    expect(await screen.findByText(/Wenia sin tasa de venta: usando la TRM/)).toBeTruthy();
    const sell = screen.getByLabelText('Tasa de venta de Wenia');
    fireEvent.change(sell, { target: { value: '4040' } });
    fireEvent.blur(sell);
    await waitFor(() => expect(actions.saveInvestmentSettings).toHaveBeenLastCalledWith(expect.objectContaining({ fxSource: 'wenia', weniaSell: 4040 })));
    expect(await screen.findByText('Wenia · tasa de venta manual')).toBeTruthy();
  });

  it('activar el aviso de TRM se guarda en los ajustes', async () => {
    const actions = await open(withUsd());
    fireEvent.click(screen.getByLabelText(/Avisarme con una notificación/));
    await waitFor(() => expect(actions.saveInvestmentSettings).toHaveBeenCalledWith(expect.objectContaining({ fxAlert: true })));
  });

  it('borrar una operación pide confirmación y la quita', async () => {
    vi.stubGlobal('confirm', () => true);
    const actions = await open(withUsd());
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar operación' }));
    await waitFor(() => expect(actions.deleteHoldingTrade).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' })));
    vi.unstubAllGlobals();
  });
  it('no se puede borrar una compra que respalda ventas posteriores', async () => {
    vi.stubGlobal('confirm', () => true); vi.stubGlobal('alert', vi.fn());
    const actions = await open(withUsd([{ id: 't2', holdingId: 'h1', date: '2020-02-01', side: 'venta', units: 60, cop: 270000, createdAt: '2' }]));
    const buttons = await screen.findAllByRole('button', { name: 'Eliminar operación' });
    fireEvent.click(buttons[buttons.length - 1]); // la compra (la más antigua queda al final)
    await waitFor(() => expect(globalThis.alert).toHaveBeenCalledWith(expect.stringMatching(/ya respalda ventas posteriores/)));
    expect(actions.deleteHoldingTrade).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('Mercados — resumen y pestañas', () => {
  it('el resumen suma el valor del portafolio y el resultado', async () => {
    TRM = 4200;
    await open(withUsd());
    expect(await screen.findByText('Tu portafolio de mercados hoy')).toBeTruthy();
    expect(screen.getByText(/Invertido .*400\.000/)).toBeTruthy();
    expect(screen.getAllByText(/420\.000/).length).toBeGreaterThan(0); // 100 × 4.200
  });
  it('guarda el precio del día para valorar el patrimonio', async () => {
    TRM = 4200;
    const actions = await open(withUsd());
    await waitFor(() => expect(actions.saveHoldingPrices).toHaveBeenCalledWith([expect.objectContaining({ holdingId: 'h1', priceCop: 4200 })]));
  });

  it('criptoactivos: se elige uno de la lista y se sigue a nombre propio', async () => {
    const actions = await open(emptyStore());
    fireEvent.click(screen.getByRole('button', { name: 'Criptoactivos' }));
    expect(screen.getByText('Aún no sigues criptoactivos')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Agregar criptoactivo/ }));
    fireEvent.click(await screen.findByText('Bitcoin', { exact: false }));
    await waitFor(() => expect(actions.ensureHolding).toHaveBeenCalledWith(expect.objectContaining({ assetClass: 'cripto', symbol: 'bitcoin', ownerMemberId: 'me' })));
  });
  it('criptoactivos: la tarjeta valora en pesos con el precio y la TRM', async () => {
    const store = { ...emptyStore(), holdings: [{ id: 'c1', ownerMemberId: 'me', assetClass: 'cripto', symbol: 'bitcoin', name: 'Bitcoin (BTC)', archived: false }], trades: [{ id: 'tc', holdingId: 'c1', date: '2020-01-01', side: 'compra', units: 0.01, cop: 2500000, createdAt: '1' }] };
    await open(store);
    fireEvent.click(screen.getByRole('button', { name: 'Criptoactivos' }));
    // 0,01 × 80.000 USD × 4.000 = 3.200.000
    expect((await screen.findAllByText(/3\.200\.000/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/\+.*700\.000/).length).toBeGreaterThan(0);
  });
  it('acciones: avisa si falta la clave de precios y deja registrar igual', async () => {
    await open(emptyStore());
    fireEvent.click(screen.getByRole('button', { name: 'Acciones' }));
    expect(await screen.findByText(/TWELVE_DATA_API_KEY/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Agregar acción/ }));
    expect(await screen.findByText('Ecopetrol S.A.', { exact: false })).toBeTruthy();
  });
  it('acciones: se puede agregar un símbolo que no está en la lista, validando su forma', async () => {
    const actions = await open(emptyStore());
    fireEvent.click(screen.getByRole('button', { name: 'Acciones' }));
    fireEvent.click(screen.getByRole('button', { name: /Agregar acción/ }));
    fireEvent.change(await screen.findByLabelText('Símbolo'), { target: { value: 'a b' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar símbolo' }));
    expect(await screen.findByText(/símbolo válido/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Símbolo'), { target: { value: 'sofi' } });
    fireEvent.change(screen.getByLabelText('Bolsa'), { target: { value: 'nasdaq' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar símbolo' }));
    await waitFor(() => expect(actions.ensureHolding).toHaveBeenCalledWith(expect.objectContaining({ assetClass: 'accion', symbol: 'SOFI', exchange: 'NASDAQ', quoteCurrency: 'USD' })));
  });
});
