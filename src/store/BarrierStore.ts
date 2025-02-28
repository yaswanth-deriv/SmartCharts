import { CSSProperties } from 'react';
import { action, computed, observable, makeObservable } from 'mobx';
import MainStore from '.';
import Context from '../components/ui/Context';
import { TBarrierChangeParam, TBarrierUpdateProps, TCIQAddEventListener, TCIQAppend } from '../types';
import PendingPromise from '../utils/PendingPromise';
import PriceLineStore from './PriceLineStore';
import ShadeStore from './ShadeStore';
import {getStringValue} from '../utils';

export default class BarrierStore {
    _high_barrier: PriceLineStore;
    _injectionId: TCIQAppend<() => void>;
    _listenerId: TCIQAddEventListener<() => void>;
    _low_barrier: PriceLineStore;
    aboveShadeStore: ShadeStore;
    belowShadeStore: ShadeStore;
    betweenShadeStore: ShadeStore;
    mainStore: MainStore;
    title?: string;
    static get SHADE_NONE_SINGLE(): string {
        return 'SHADE_NONE_SINGLE';
    }
    static get SHADE_NONE_DOUBLE(): string {
        return 'SHADE_NONE_DOUBLE';
    }
    static get SHADE_ABOVE(): string {
        return 'SHADE_ABOVE';
    }
    static get SHADE_BELOW(): string {
        return 'SHADE_BELOW';
    }
    static get SHADE_BETWEEN(): string {
        return 'SHADE_BETWEEN';
    }
    static get SHADE_OUTSIDE(): string {
        return 'SHADE_OUTSIDE';
    }

    static get BARRIER_CHANGED(): string {
        return 'BARRIER_CHANGED';
    }

    shadeColor?: string;
    color?: string;
    foregroundColor?: string;
    isBetweenShadeVisible = false;
    isTopShadeVisible = false;
    isBottomShadeVisible = false;
    hidePriceLines = false;
    lineStyle?: CSSProperties['borderStyle'];
    isInitialized = false;
    initializePromise = PendingPromise<void, void>();
    hideBarrierLine = false;
    hideOffscreenLine = false;
    hideOffscreenBarrier = false;
    isSingleBarrier = false;

    _shadeState = '';

    get pip(): number {
        return this.mainStore.chart.currentActiveSymbol?.decimal_places as number;
    }
    get yAxisWidth(): number {
        return this.mainStore.chart.yAxiswidth;
    }
    get overlappedBarrierWidth(): number {
        return 16;
    }

    constructor(mainStore: MainStore) {
        makeObservable(this, {
            shadeColor: observable,
            color: observable,
            foregroundColor: observable,
            isBetweenShadeVisible: observable,
            isTopShadeVisible: observable,
            isBottomShadeVisible: observable,
            hidePriceLines: observable,
            lineStyle: observable,
            isInitialized: observable,
            initializePromise: observable,
            hideBarrierLine: observable,
            hideOffscreenLine: observable,
            hideOffscreenBarrier: observable,
            isSingleBarrier: observable,
            destructor: action.bound,
            init: action.bound,
            overlappedBarrierWidth: computed,
            pip: computed,
            updateProps: action.bound,
            yAxisWidth: computed,
        });

        this.mainStore = mainStore;
        this._high_barrier = new PriceLineStore(this.mainStore);
        this._low_barrier = new PriceLineStore(this.mainStore);

        this._high_barrier.onPriceChanged(this._drawShadedArea);
        this._low_barrier.onPriceChanged(this._drawShadedArea);

        this._high_barrier.onDragReleased(this._fireOnBarrierChange);
        this._low_barrier.onDragReleased(this._fireOnBarrierChange);

        this._injectionId = this.stx.append('draw', this._drawShadedArea);

        this._setupConstrainBarrierPrices();

        this._listenerId = this.stx.addEventListener('newChart', this.init);

        this.aboveShadeStore = new ShadeStore('top-shade');
        this.betweenShadeStore = new ShadeStore('between-shade');
        this.belowShadeStore = new ShadeStore('bottom-shade');

        this.shadeState = BarrierStore.SHADE_NONE_SINGLE;

        if (this.context && mainStore.chart.currentCloseQuote()) {
            this.init();
        }

        this.mainStore.chart._barriers.push(this);
    }

    init(): void {
        this.isInitialized = true;
        this.initializePromise.resolve();

        // Enable this to test barriers; high low values are mandatory
        // for library user to provide
        // this.setDefaultBarrier();
    }

    setDefaultBarrier(): void {
        const price = this.relative ? 0 : this.mainStore.chart.currentCloseQuote()?.Close;
        const distance = this.chart.yAxis.priceTick;
        this._high_barrier.price = (price + distance).toString();
        this._low_barrier.price = ((price as number) - distance).toString();
        this._high_barrier._calculateTop();
        this._low_barrier._calculateTop();
        this._drawShadedArea();
    }

    updateProps(
        {
            color,
            foregroundColor,
            shadeColor,
            shade,
            high,
            low,
            relative,
            draggable,
            onChange,
            hideBarrierLine,
            hideOffscreenBarrier,
            hideOffscreenLine,
            hidePriceLines,
            lineStyle,
            title,
            showOffscreenArrows,
            isSingleBarrier,
            opacityOnOverlap,
        }: TBarrierUpdateProps
    ): void {
        this.initializePromise.then(
            action(() => {
                if (color) {
                    this.color = color;
                }
                if (foregroundColor) {
                    this.foregroundColor = foregroundColor;
                }
                if (shadeColor) {
                    this.shadeColor = shadeColor;
                }
                if (shade) {
                    this.shadeState = `SHADE_${shade}`.toUpperCase();
                }
                if (relative !== undefined) {
                    this.relative = relative;
                }
                if (draggable !== undefined) {
                    this.draggable = draggable;
                }
                if (high !== undefined) {
                    this.high_barrier = getStringValue(high, this.pip);
                }
                if (low !== undefined) {
                    this.low_barrier = getStringValue(low, this.pip);
                }
                if (onChange) {
                    this.onBarrierChange = onChange;
                }
                if (title) {
                    this.title = title;
                }
                this.lineStyle = lineStyle;
                this.hideBarrierLine = !!hideBarrierLine;
                this.hidePriceLines = !!hidePriceLines;
                this.hideOffscreenLine = !!hideOffscreenLine;
                this.hideOffscreenBarrier = !!hideOffscreenBarrier;
                this.isSingleBarrier = !!isSingleBarrier;
            })
        );
        if (opacityOnOverlap) {
            this.opacityOnOverlap = opacityOnOverlap;
        }
        if (showOffscreenArrows) {
            this.showOffscreenArrows = showOffscreenArrows;
        }
    }

    destructor(): void {
        if (!this.context) return;
        this.stx.removeInjection(this._injectionId);
        this.stx.removeEventListener(this._listenerId);
        this._high_barrier.destructor();
        this._low_barrier.destructor();

        const i = this.mainStore.chart._barriers.findIndex((b: BarrierStore) => b === this);
        if (i !== -1) {
            this.mainStore.chart._barriers.splice(i, 1);
        }
    }

    get high_barrier(): string {
        return this._high_barrier.price;
    }
    set high_barrier(price: string) {
        this._high_barrier.price = price;
    }
    get low_barrier(): string {
        return this._low_barrier.price;
    }
    set low_barrier(price: string) {
        this._low_barrier.price = price;
    }

    _setupConstrainBarrierPrices(): void {
        // barrier 1 cannot go below barrier 2
        this._high_barrier.priceConstrainer = (newPrice: number) => {
            const nextPrice =
                this._low_barrier.visible && newPrice < +this._low_barrier.realPrice
                    ? this._high_barrier.realPrice
                    : newPrice;
            this.mainStore.chart.calculateYaxisWidth(+nextPrice);

            return +nextPrice;
        };

        // barrier 2 cannot go above barrier 1
        this._low_barrier.priceConstrainer = (newPrice: number) => {
            const nextPrice = newPrice > +this._high_barrier.realPrice ? this._low_barrier.realPrice : newPrice;

            this.mainStore.chart.calculateYaxisWidth(+nextPrice);
            return +nextPrice;
        };
    }

    get context(): Context | null {
        return this.mainStore.chart.context;
    }
    get stx(): Context['stx'] {
        return this.context?.stx;
    }
    get chart(): typeof CIQ.ChartEngine.Chart {
        return this.stx.chart;
    }

    _onBarrierChange: ((arg: TBarrierChangeParam) => void) | null = null;

    set onBarrierChange(callback: (param: TBarrierChangeParam) => void) {
        if (this._onBarrierChange !== callback) {
            this._onBarrierChange = callback;
        }
    }

    _fireOnBarrierChange = (): void => {
        const high = this._high_barrier.visible ? Number(this._high_barrier.price).toFixed(this.pip) : undefined;
        const low = this._low_barrier.visible ? Number(this._low_barrier.price).toFixed(this.pip) : undefined;

        if (typeof this._onBarrierChange === 'function') {
            this._onBarrierChange({ high, low });
        }
    };

    get shadeState(): string {
        return this._shadeState;
    }

    set shadeState(shadeState: string) {
        if (this._shadeState === shadeState) {
            return;
        }
        this._shadeState = shadeState;

        const noShade =
            this._shadeState === BarrierStore.SHADE_NONE_SINGLE || this._shadeState === BarrierStore.SHADE_NONE_DOUBLE;

        if (noShade) {
            this.aboveShadeStore.visible = false;
            this.betweenShadeStore.visible = false;
            this.belowShadeStore.visible = false;
        } else {
            const aboveShadeEnable =
                this._shadeState === BarrierStore.SHADE_ABOVE || this._shadeState === BarrierStore.SHADE_OUTSIDE;
            const belowShadeEnable =
                this._shadeState === BarrierStore.SHADE_BELOW || this._shadeState === BarrierStore.SHADE_OUTSIDE;
            const betweenShadeEnable = this._shadeState === BarrierStore.SHADE_BETWEEN;

            this.aboveShadeStore.visible = aboveShadeEnable;
            this.betweenShadeStore.visible = betweenShadeEnable;
            this.belowShadeStore.visible = belowShadeEnable;

            this._drawShadedArea();
        }

        const showLowBarrier =
            this._shadeState === BarrierStore.SHADE_OUTSIDE ||
            this._shadeState === BarrierStore.SHADE_BETWEEN ||
            this._shadeState === BarrierStore.SHADE_NONE_DOUBLE;

        const wasLowBarrierVisible = this._low_barrier.visible;
        this._low_barrier.visible = showLowBarrier;

        if (this.isInitialized && showLowBarrier && !wasLowBarrierVisible) {
            if (+this._low_barrier.realPrice >= +this._high_barrier.realPrice) {
                // fix position if _low_barrier above _high_barrier, since _low_barrier position is not updated when not visible
                this._low_barrier.price = (+this._high_barrier.price - this.chart.yAxis.priceTick).toString();
            }
        }
    }

    get relative(): boolean {
        return this._high_barrier.relative;
    }

    set relative(value: boolean) {
        this._high_barrier.relative = value;
        this._low_barrier.relative = value;
    }

    get draggable(): boolean {
        return this._high_barrier.draggable;
    }

    set draggable(value: boolean) {
        this._high_barrier.draggable = value;
        this._low_barrier.draggable = value;
    }

    get showOffscreenArrows(): boolean {
        return this._high_barrier.showOffscreenArrows;
    }

    set showOffscreenArrows(value: boolean) {
        this._high_barrier.showOffscreenArrows = value;
    }

    get opacityOnOverlap(): number {
        return this._high_barrier.opacityOnOverlap;
    }

    set opacityOnOverlap(value: number) {
        this._high_barrier.opacityOnOverlap = value;
    }

    _drawShadedArea = (): void => {
        if (!this.isInitialized) {
            return;
        }

        if (this._shadeState === BarrierStore.SHADE_ABOVE) {
            this._shadeAbove();
        } else if (this._shadeState === BarrierStore.SHADE_BELOW) {
            this._shadeBelow();
        } else if (this._shadeState === BarrierStore.SHADE_BETWEEN) {
            this._shadeBetween();
        } else if (this._shadeState === BarrierStore.SHADE_OUTSIDE) {
            this._shadeOutside();
        }

        if (this._low_barrier.visible && this._isBarriersOffScreen()) {
            const order = this._high_barrier.top === 0 ? null : 101;
            this._high_barrier.zIndex = order;
        }
    };

    _isBarriersOffScreen(): boolean {
        return this._high_barrier.offScreen && this._low_barrier.offScreen;
    }

    _shadeBetween(): void {
        this.betweenShadeStore.setPosition({
            top: this._high_barrier.top,
            bottom: this._low_barrier.top,
            right: this.yAxisWidth,
        });
    }

    _shadeBelow(barrier: PriceLineStore = this._high_barrier): void {
        this.belowShadeStore.setPosition({
            top: barrier.top,
            bottom: 0,
            right: this.yAxisWidth,
        });
    }

    _shadeAbove(barrier: PriceLineStore = this._high_barrier): void {
        this.aboveShadeStore.setPosition({
            top: 0,
            bottom: barrier.top,
            right: this.yAxisWidth,
        });
    }

    _shadeOutside(): void {
        this._shadeAbove(this._high_barrier);
        this._shadeBelow(this._low_barrier);
    }
}
