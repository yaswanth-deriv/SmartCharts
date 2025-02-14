import { action, observable, when, makeObservable } from 'mobx';
import MainStore from '.';
import Context from '../components/ui/Context';

export default class BottomWidgetsContainerStore {
    mainStore: MainStore;
    bottom = 0;
    isReadyToShow = false;
    mainChartHeight = 0;
    top = 0;
    totalHeight = 0;

    get context(): Context | null {
        return this.mainStore.chart.context;
    }
    get stx(): Context['stx'] {
        return this.context?.stx;
    }
    get state(): MainStore['state'] {
        return this.mainStore.state;
    }

    constructor(mainStore: MainStore) {
        makeObservable(this, {
            bottom: observable,
            isReadyToShow: observable,
            mainChartHeight: observable,
            top: observable,
            totalHeight: observable,
            updateChartHeight: action.bound,
        });

        this.mainStore = mainStore;

        when(() => !!this.context, this.initial);
    }

    initial = (): void => {
        this.stx.append('drawPanels', this.updateChartHeight);
        this.isReadyToShow = true;
    };

    updateChartHeight(): void {
        this.mainChartHeight = this.stx.panels.chart.height;
        this.totalHeight = Object.keys(this.stx.panels).reduce(
            (acc, key) => acc + (this.stx.panels[key].hidden ? 0 : this.stx.panels[key].height),
            0
        );
        const addedIndicatorsHeight = Object.keys(this.stx.panels).reduce(
            (sum, key) => sum + (this.stx.panels[key].hidden || key === 'chart' ? 0 : this.stx.panels[key].height),
            0
        );
        const margin = this.totalHeight > this.mainChartHeight ? 0 : 30;
        this.top = this.mainChartHeight - margin - 200;
        this.bottom = addedIndicatorsHeight || 30;
    }

    updateChartMargin = (hasBottomWidget: boolean): void => {
        if (this.context && this.stx) {
            const marginTop = this.state.yAxisMargin.top || 106;
            let marginBottom = this.state.yAxisMargin.bottom || 64;

            if (hasBottomWidget) {
                marginBottom += 64;
            }

            if (
                this.stx.chart.yAxis.initialMarginTop !== marginTop ||
                this.stx.chart.yAxis.initialMarginBottom !== marginBottom
            ) {
                this.stx.chart.yAxis.initialMarginTop = marginTop;
                this.stx.chart.yAxis.initialMarginBottom = marginBottom;
                if (this.state.heightFactor) {
                    this.stx.chart.yAxis.heightFactor = this.state.heightFactor;
                }
                this.stx.calculateYAxisMargins(this.stx.chart.panel.yAxis);
                this.stx.draw();
            }
            if (!this.mainStore.state.shouldMinimiseLastDigits) {
                this.mainStore.state.setShouldMinimiseLastDigit(this.stx.chart.panel.height < 460);
            }
        }
    };
}
