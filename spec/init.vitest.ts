import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import deepEqualInAnyOrder from 'deep-equal-in-any-order';

chai.use(chaiAsPromised);
chai.use(deepEqualInAnyOrder);

import colors from '../src/utils/colors';
colors.enabled = true;
